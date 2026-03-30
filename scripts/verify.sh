#!/bin/bash
set -e

echo "🔍 Verifying Boundaries..."
pnpm exec dependency-cruiser packages/*/src apps/*/src --exclude "^node_modules"

echo "🔍 Checking for Unused Dependencies (Knip)..."
pnpm exec knip

echo "🔍 Running Tests..."
pnpm turbo test

echo "🔍 Linting..."
pnpm turbo lint

echo "🔍 Typechecking..."
pnpm turbo typecheck

echo "✅ All verification passed!"
