#!/bin/sh
# Controleert dat er geen echte persoons-, bank- of adresgegevens in de
# repository terechtkomen. Draait in CI en als git pre-commit hook:
#
#   git config core.hooksPath scripts/git-hooks
#
# Extra eigen zoektermen (bijv. namen van echte huurders) kun je lokaal in
# referentie/privacy-patronen.txt zetten (één per regel). Die map staat in
# .gitignore, dus de zoektermen zelf komen nooit in de repository.

set -eu
cd "$(git rev-parse --show-toplevel)"

fout=0
meld() { echo "PRIVACY: $1" >&2; fout=1; }

# 1. Verboden paden mogen nooit gevolgd worden.
if git ls-files --cached | grep -E '(^|/)(referentie|pb_data|exports)/|(^|/)\.env$|(^|/)\.env\.(local|production)$' >/dev/null; then
  meld "bestanden uit referentie/, pb_data/, exports/ of .env staan in git:"
  git ls-files --cached | grep -E '(^|/)(referentie|pb_data|exports)/|(^|/)\.env$|(^|/)\.env\.(local|production)$' >&2
fi

# 2. Echte IBAN's (de testwaarde NL00 TEST ... is toegestaan).
bestanden=$(git ls-files --cached | grep -v -E 'package-lock\.json$|\.(png|jpg|jpeg|webp|ico|pdf|woff2?)$' || true)
if [ -n "$bestanden" ]; then
  if echo "$bestanden" | xargs grep -n -E '\b[A-Z]{2}[0-9]{2} ?[A-Z]{4} ?[0-9]{4} ?[0-9]{4} ?[0-9]{2}\b' 2>/dev/null | grep -v 'NL00 TEST' | grep -v -E 'NL00TEST'; then
    meld "mogelijk echt IBAN-nummer gevonden (zie hierboven)."
  fi
fi

# 3. Eigen zoektermen uit referentie/privacy-patronen.txt.
if [ -f referentie/privacy-patronen.txt ] && [ -n "$bestanden" ]; then
  while IFS= read -r patroon; do
    [ -z "$patroon" ] && continue
    case "$patroon" in \#*) continue;; esac
    if echo "$bestanden" | xargs grep -n -i -F -- "$patroon" 2>/dev/null; then
      meld "zoekterm uit privacy-patronen.txt gevonden: $patroon"
    fi
  done < referentie/privacy-patronen.txt
fi

if [ "$fout" -ne 0 ]; then
  echo "Commit/build afgebroken: verwijder de gevoelige gegevens." >&2
  exit 1
fi
echo "Privacycontrole: in orde."
