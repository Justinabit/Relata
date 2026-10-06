"""Init script that marks the first-visit popups as already handled, for tests that are about something else."""
SEEN = (
    "try{localStorage.setItem('relata:terms:v1','2026-01-01');"
    "localStorage.setItem('relata:onboarded:v1','1');"
    "localStorage.setItem('relata:cookies:v1','closed');}catch(e){}"
)
