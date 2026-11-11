# Восстанавливает OpenSSH-ключ, вставленный с телефона (CRLF, пробелы вместо переносов, без последнего \n).
import os, re, sys
raw = os.environ["KEY"].replace("\r", "")
m = re.search(r"-----BEGIN ([A-Z ]+)-----(.*?)-----END \1-----", raw, re.S)
if not m:
    sys.exit("ключ не похож на приватный: нет BEGIN/END")
body = re.sub(r"\s+", "", m.group(2))
lines = [body[i:i + 70] for i in range(0, len(body), 70)]
sys.stdout.write(f"-----BEGIN {m.group(1)}-----\n" + "\n".join(lines) + f"\n-----END {m.group(1)}-----\n")
