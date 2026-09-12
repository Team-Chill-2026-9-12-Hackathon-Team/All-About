# D evidence engine

`buildAnswer(plan, batch, signal)` consumes C's `PageSnapshot` batch and returns
the contract `AnswerBundle`. Contract types come from `@allabout/contracts`.

Requested factual fields are `deadline`, `submission_format`, `eligibility`,
`location`, and `requirements`. Deadline/location/eligibility go to
`summary`; submission format/requirements go to `requirements`; student
experience belongs in `communityNotes`. Missing fields remain in `unknowns`.

Source registry: `fixtures/source-registry.json`. Real official pages are
initially assigned `institution` authority. Instructor authority is only used
for fixture metadata or an explicit C/B registry value; an `official` page is
not automatically an instructor statement. An instructor claim can supersede
an older date only when its quote explicitly says it was extended, postponed,
rescheduled, or moved.

Dates preserve the source's timezone or raw value. The engine never invents a
time such as 23:59. The UofT Academic Calendar URL is the stable live page
validated for the demo; UofT Events remains optional because availability may
vary.
