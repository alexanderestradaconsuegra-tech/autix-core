#!/usr/bin/env python3
"""Revisa que un cambio sea solo visual.
Uso: python3 guard.py <commit_base> [--head HEAD] [--path src]
Lee `git diff -U0 base..head` y separa las líneas cambiadas en:
  - visuales: clases, estilos, CSS, íconos, imports de UI
  - sospechosas: cualquier otra línea en .ts/.tsx/.js/.jsx (posible lógica)
Sale con código 1 si hay archivos prohibidos o líneas sospechosas, para que no se entregue sin revisión."""
import re, subprocess, sys

args = sys.argv[1:]
if not args:
    sys.exit(__doc__)
base = args[0]
head = args[args.index('--head') + 1] if '--head' in args else 'HEAD'
path = args[args.index('--path') + 1] if '--path' in args else '.'

FORBIDDEN = re.compile(r'(^|/)(middleware\.[jt]s|\.env[^/]*|next\.config\.[jt]s|package(-lock)?\.json|pnpm-lock\.yaml|.*\.sql|.*(sw|service-worker)\.js|manifest\.json|Dockerfile|docker-compose\.ya?ml|src/lib/(?!i18n).*|src/app/api/.*|.*actions?\.[jt]sx?|.*route\.[jt]s)$')
CODE_EXT = ('.ts', '.tsx', '.js', '.jsx')
VISUAL = re.compile(
    r'(className\s*=|class\s*=|cn\(|clsx\(|twMerge\(|style\s*=\s*\{|[\'"`][^\'"`]*\b(?:bg|text|border|rounded|shadow|p[xytblr]?|m[xytblr]?|gap|flex|grid|w|h|min|max|ring|from|to|via|opacity|transition|duration|ease|animate|backdrop|blur|z|top|left|right|bottom|inset|translate|scale|rotate|font|leading|tracking|dark|hover|focus|sm|md|lg|xl)[-:][^\'"`]*[\'"`]'
    r'|^\s*[+-]\s*import .* from [\'"](?:lucide-react|clsx|tailwind-merge|@/components/ui/.*)[\'"]'
    r'|^\s*[+-]\s*(?:<|</)[A-Za-z]+[^>]*>?\s*$|^\s*[+-]\s*\)?\}?;?,?\s*$|^\s*[+-]\s*//|^\s*[+-]\s*/\*)')
LOGIC = re.compile(r'(supabase|fetch\(|axios|await |async |useEffect|useState|useMemo|useCallback|router\.|redirect\(|localStorage|sessionStorage|process\.env|\.from\(|\.rpc\(|\.insert\(|\.update\(|\.delete\(|onSubmit|onClick\s*=\s*\{(?!\s*\(\)\s*=>\s*set)|JSON\.|throw |if \(|return \()')

out = subprocess.run(['git', 'diff', '-U0', f'{base}..{head}', '--', path], capture_output=True, text=True, check=True).stdout
files, cur, bad_files, sus = {}, None, [], []
for line in out.splitlines():
    if line.startswith('+++ b/'):
        cur = line[6:]; files[cur] = 0
        if FORBIDDEN.search(cur): bad_files.append(cur)
    elif cur and line[:1] in '+-' and not line.startswith(('+++', '---')):
        files[cur] += 1
        if cur.endswith(CODE_EXT):
            body = line[1:]
            if LOGIC.search(body) and not re.search(r'className|class=', body):
                sus.append((cur, line.rstrip()))
            elif not VISUAL.search(line) and body.strip():
                sus.append((cur, line.rstrip()))

print(f'Archivos cambiados: {len(files)}')
for f, n in sorted(files.items()): print(f'  {n:4d} líneas  {f}')
if bad_files:
    print('\nARCHIVOS QUE NO DEBERÍAN TOCARSE:')
    for f in bad_files: print('  ' + f)
if sus:
    print(f'\nLÍNEAS A REVISAR A MANO ({len(sus)}): puede ser lógica o texto, no solo estilo')
    for f, l in sus[:80]: print(f'  {f}: {l[:160]}')
    if len(sus) > 80: print(f'  ... y {len(sus) - 80} más')
if bad_files or sus:
    sys.exit(1)
print('\nOK: el diff parece solo visual.')
