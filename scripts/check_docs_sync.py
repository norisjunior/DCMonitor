#!/usr/bin/env python3
"""
Verifica se os arquivos de documentação críticos existem e não estão vazios.
Encerra com código 1 e lista os arquivos ausentes/vazios caso algum seja encontrado.
"""

import sys
from pathlib import Path

DOCS_OBRIGATORIOS = [
    "README.md",
    "PROJECT_BRIEF.md",
    "CHANGELOG.md",
    "docs/ARCHITECTURE.md",
    "docs/REQUIREMENTS.md",
    "docs/TESTING_STRATEGY.md",
    "docs/DEPLOY_PROD.md",
    "docs/SECURITY.md",
    "docs/EMBEDDED_IOT_GUIDELINES.md",
    "ESP32/README.md",
    "node-red/README.md",
    "n8n/README.md",
    "grafana/README.md",
]

raiz = Path(__file__).parent.parent
problemas = []

for doc in DOCS_OBRIGATORIOS:
    caminho = raiz / doc
    if not caminho.exists():
        problemas.append(f"AUSENTE: {doc}")
    elif caminho.stat().st_size < 50:
        problemas.append(f"VAZIO ou MUITO CURTO: {doc}")

if problemas:
    print("Verificação de sincronização de docs FALHOU:")
    for item in problemas:
        print(f"  {item}")
    sys.exit(1)

print("Verificação de sincronização de docs aprovada.")
