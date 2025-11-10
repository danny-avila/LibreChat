FROM searxng/searxng:latest

# Materialize the default settings file and enable JSON output along with HTML.
RUN set -eux; \
    mkdir -p /etc/searxng; \
    cp /usr/local/searxng/searx/settings.yml /etc/searxng/settings.yml; \
    python3 - <<'PY'
from pathlib import Path

path = Path('/etc/searxng/settings.yml')
lines = path.read_text().splitlines()

# Ensure JSON output is allowed alongside HTML.
for idx, line in enumerate(lines):
    if line.strip().startswith('formats:'):
        insertion_index = idx + 1
        seen_json = False
        while insertion_index < len(lines) and lines[insertion_index].startswith('    -'):
            if lines[insertion_index].strip() == '- json':
                seen_json = True
                break
            insertion_index += 1
        if not seen_json:
            lines.insert(idx + 2, '    - json')
        break

text = '\n'.join(lines)
text = text.replace('bind_address: "127.0.0.1"', 'bind_address: "0.0.0.0"', 1)
text = text.replace('port: 8888', 'port: 8080', 1)

path.write_text(text + '\n')
PY
