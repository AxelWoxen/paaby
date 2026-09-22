-- Ny mellomstatus for candidates fra collectoren ("Fra API"): 'triaged'.
--
-- I dag går en candidate rett fra 'pending' til 'approved' (= publisert) ved
-- ett trykk. Adminpanelet får nå en egen "Fra API"-fane som viser rene
-- collector-funn for seg selv (source = 'collector'); der betyr "Godkjenn"
-- kun "send til vurdering", ikke publisering — den nye 'triaged'-statusen
-- brukes til akkurat det. "Til vurdering" viser deretter manuelt lagt inn
-- (source = 'manuell') OG triagerte collector-funn, og PUBLISERER først når
-- den fanen godkjenner. 'approved'/'rejected' og selve publiseringsflyten
-- er uendret.

ALTER TABLE event_candidates
  DROP CONSTRAINT event_candidates_status_check;

ALTER TABLE event_candidates
  ADD CONSTRAINT event_candidates_status_check
  CHECK (status IN ('pending', 'triaged', 'approved', 'rejected'));
