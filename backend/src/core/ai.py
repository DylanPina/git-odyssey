from google import genai

class AIEngine:
    def __init__(self, model: str="gemini-2.5-flash"):
        self.llm = genai.Client()



