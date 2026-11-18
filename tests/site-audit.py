"""Static integration checks; run with Python 3 from any working directory."""
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
import json
import re
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]


class Document(HTMLParser):
    def __init__(self, path):
        super().__init__(convert_charrefs=True)
        self.path = path
        self.elements = []
        self.feed(path.read_text(encoding='utf-8-sig'))
        self.ids = {attrs['id'] for _, attrs in self.elements if 'id' in attrs}

    def handle_starttag(self, tag, attrs):
        self.elements.append((tag, dict(attrs)))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)


documents = {path.name: Document(path) for path in ROOT.glob('*.html')}
errors = []
forms = 0
local_references = 0
for name, document in documents.items():
    counts = Counter(attrs['id'] for _, attrs in document.elements if 'id' in attrs)
    errors += [f'{name}: duplicate id {key}' for key, value in counts.items() if value > 1]
    if len([1 for tag, _ in document.elements if tag == 'h1']) != 1:
        errors.append(f'{name}: expected exactly one h1')
    if name != 'MediaQueries.html':
        if not any(tag == 'meta' and attrs.get('name') == 'viewport' for tag, attrs in document.elements):
            errors.append(f'{name}: missing viewport metadata')
        if not any(tag == 'meta' and attrs.get('name') == 'description' and attrs.get('content') for tag, attrs in document.elements):
            errors.append(f'{name}: missing description')
        nav_links = {attrs.get('href') for tag, attrs in document.elements if tag == 'a' and 'nav-link' in attrs.get('class', '').split()}
        expected = {'index.html', 'Drivers.html', 'Schedule.html', 'Contacts.html', 'FanGuide.html', 'Profile.html'}
        if not expected.issubset(nav_links):
            errors.append(f'{name}: navigation is not connected to all main pages')
    for tag, attrs in document.elements:
        if tag == 'form':
            forms += 1
            if 'novalidate' not in attrs:
                errors.append(f'{name}: form {attrs.get("id")} lacks novalidate')
        if tag in {'input', 'select', 'textarea'}:
            banned = {'required', 'pattern', 'minlength', 'maxlength', 'min', 'max'} & attrs.keys()
            if banned or attrs.get('type') == 'email':
                errors.append(f'{name}: native validation on {attrs.get("id")}: {banned}')
            if attrs.get('type') not in {'hidden', 'submit', 'button'} and not any(t == 'label' and a.get('for') == attrs.get('id') for t, a in document.elements):
                errors.append(f'{name}: missing label for {attrs.get("id")}')
        for attribute in ['aria-controls', 'aria-describedby', 'aria-labelledby']:
            for target in attrs.get(attribute, '').split():
                if target not in document.ids:
                    errors.append(f'{name}: {attribute} refers to missing {target}')
        for attribute in ['href', 'src', 'data-src']:
            value = attrs.get(attribute)
            if not value:
                continue
            url = urlsplit(value)
            if url.scheme or url.netloc:
                continue
            relative = unquote(url.path)
            target = document.path.parent / relative if relative else document.path
            local_references += 1
            if not target.exists():
                errors.append(f'{name}: missing {value}')
                continue
            if relative and target.name not in {item.name for item in target.parent.iterdir()}:
                errors.append(f'{name}: filename case mismatch {value}')
            if url.fragment and target.suffix.lower() == '.html':
                target_document = documents.get(target.name)
                if not target_document or unquote(url.fragment) not in target_document.ids:
                    errors.append(f'{name}: missing fragment {value}')

for path in (ROOT / 'css').glob('*.css'):
    for reference in re.findall(r'url\([\'\"]?([^\)\'\"]+)', path.read_text(encoding='utf-8-sig')):
        if not urlsplit(reference).scheme and not (path.parent / unquote(reference)).exists():
            errors.append(f'{path.name}: missing CSS asset {reference}')

data = (ROOT / 'js/drivers-data.js').read_text(encoding='utf-8-sig')
drivers = json.loads(data[data.index('['):data.rindex(']') + 1])
driver_ids = {driver['id'] for driver in drivers}
if len(driver_ids) != len(drivers):
    errors.append('Driver metadata has duplicate ids')
for driver in drivers:
    if not (ROOT / driver['image']).is_file():
        errors.append(f'Driver metadata image missing: {driver["image"]}')
card_ids = {attrs.get('data-driver-id') for _, attrs in documents['Drivers.html'].elements if 'data-driver-id' in attrs}
heart_ids = {attrs.get('data-like-driver') for _, attrs in documents['Drivers.html'].elements if 'data-like-driver' in attrs}
if card_ids != driver_ids or heart_ids != driver_ids:
    errors.append('Driver cards, hearts and account metadata do not match')

for name, document in documents.items():
    scripts = [urlsplit(attrs['src']).path for tag, attrs in document.elements if tag == 'script' and attrs.get('src')]
    for dependency, consumer in [('js/drivers-data.js', 'js/account.js'), ('js/account.js', 'js/likes.js')]:
        if consumer in scripts and (dependency not in scripts or scripts.index(dependency) > scripts.index(consumer)):
            errors.append(f'{name}: {dependency} must load before {consumer}')

if errors:
    raise SystemExit('\n'.join(errors))
print(f'Source audit passed: {len(documents)} HTML pages, {forms} forms, {local_references} local references, {len(drivers)} matching driver cards/hearts, valid script dependencies.')
