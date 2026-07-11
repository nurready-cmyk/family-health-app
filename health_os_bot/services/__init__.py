"""External integrations: LLM structuring (OpenAI) and local speech-to-text
(faster-whisper).

Kept separate from core/ so business logic never depends on a specific
provider's SDK - core/ calls a service interface, not openai or
faster_whisper directly.
"""

