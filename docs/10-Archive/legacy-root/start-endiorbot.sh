#!/bin/bash
# EndiorBot Quick Start
# Usage: source start-endiorbot.sh

# Load environment
if [ -f .env.local ]; then
  source .env.local
  echo "✅ Environment loaded from .env.local"
else
  echo "⚠️  No .env.local found. Create one with API keys."
fi

# Create alias
alias endiorbot="$(pwd)/endiorbot.mjs"
echo "✅ Alias created: endiorbot"

# Show available commands
echo ""
echo "📋 Available Commands:"
echo "  endiorbot consult \"<question>\"  - 3-model consultation"
echo "  endiorbot gate status           - Show SDLC gate status"
echo "  endiorbot models                - List available AI models"
echo ""
echo "🎯 Examples:"
echo "  endiorbot consult \"Redis vs PostgreSQL for sessions?\""
echo "  endiorbot consult --full \"design payment gateway\""
echo ""
