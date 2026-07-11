"""Business logic layer (Decision Engine).

Handlers never talk to Google Sheets or OpenAI directly - they call into
this package, which orchestrates the database/ repositories and services/
integrations. This is where family-member permission checks, metric
extraction rules, and recommendation logic live.
"""

