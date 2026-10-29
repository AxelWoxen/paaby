---
name: branch-workflow
description: Bruk alltid når du gjør endringer i kode eller filer i paaby, i alle deler av repoet (frontend, backend, collector m.fl.). Endringer skal committes til en feature-branch, aldri direkte til main, og hver sak får sin egen branch laget fra main.
---

# Branch-workflow

Aldri commit direkte til `main`. Alle endringer går via en egen branch.

## Én branch per sak

Hver sak får sin egen branch: én feature, én bugfiks eller én forbedring som henger sammen. Det gjør PR-ene små, lar sakene merges uavhengig av hverandre og gjør det lett å reversere én ting.

Test: «Ville jeg skrevet dette i samme PR-beskrivelse som det branchen allerede handler om?» Hvis nei, lag ny branch.

Ikke bruk branchen som tilfeldigvis er sjekket ut bare fordi den er en feature-branch. Navnet og commitene på branchen forteller hva den handler om. Sjekk at oppgaven passer før du jobber videre på den.

## Før du endrer noe

1. Sjekk gjeldende branch og hva den handler om: `git branch --show-current` og `git log --oneline main..HEAD`.
2. Hvis du står på `main` (eller `master`): opprett og bytt til en ny branch før første endring, f.eks. `git switch -c feature/kort-beskrivelse`. Bruk prefiks etter type: `feature/`, `fix/`, `chore/`.
3. Hvis du står på en feature-branch som handler om samme sak, fortsett på den.
4. Hvis oppgaven er en annen sak: lag ny branch fra `main` (`git switch -c feature/navn main`), ikke fra den gjeldende feature-branchen. Ellers blir den andre sakens commits med i PR-en.

## Hvis endringer allerede ligger på feil branch

- Ikke committet: `git stash push -m "navn" -- <filer>`, `git switch -c feature/navn main`, `git stash pop`. Ta bare med filene som hører til saken.
- Committet: lag ny branch fra `main` og `git cherry-pick` commiten dit. Si fra til brukeren før du fjerner noe fra den opprinnelige branchen.

## Når du committer

- Commit kun på feature-branchen, med en kort og beskrivende melding.
- Stage bare filer som hører til endringen. La urelaterte endringer og testdata (f.eks. `_kart-testdata.json`) ligge.
- Ikke push til eller merge inn i `main` selv. Foreslå en pull request, og la brukeren bestemme når det merges.
- Aldri bruk `git push --force` mot `main`.

## Hvis du ved en feil har committet på main

Stopp, ikke push. Flytt commiten til en ny branch (`git branch feature/navn`, deretter tilbakestill `main` til `origin/main`), og si fra til brukeren først.
