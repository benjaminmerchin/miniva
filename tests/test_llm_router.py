import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from router import detect_target_agent

sentences_to_test = [
    "Je dois faire ma déclaration de revenus pour l'année 2025, c'est l'enfer...",
    "J'ai pris mes billets Air France pour aller au Japon l'été prochain !",
    "Il n'y a plus rien dans le frigo, je vais devoir aller au supermarché.",
    "Salut l'équipe, comment ça va aujourd'hui ?",
    "J'ai peur que le fisc me redresse suite à mon achat immobilier.",
    "Est-ce que tu peux me conseiller un bon restaurant pour mon séjour à Rome ?",
    "Tu penses quoi du dernier film Marvel ?"
]

print("=== LLM Orchestrator Tests ===")
print("Model: google/gemma-4-26b-a4b-it\n")

for sentence in sentences_to_test:
    print(f"Message: \"{sentence}\"")
    agent = detect_target_agent(sentence)
    print(f"-> Routed to: **{agent}**\n")
