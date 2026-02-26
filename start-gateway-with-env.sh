#!/bin/bash
# Start Gateway with environment variables loaded from .env.local

# Load environment variables
set -a
source .env.local
set +a

# Start Gateway
./endiorbot.mjs gateway start
