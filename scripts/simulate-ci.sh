#!/usr/bin/env bash
# DRIFT Platform — Live CI/CD Ingestion Simulation Script
# Run this script during your presentation to trigger a live breaking change analysis report.

echo "🚀 Simulating GitHub Actions CI runner triggering DRIFT Sentinel..."

HOST="http://localhost:3000"

# 1. Trigger GitHub Webhook Event
echo "📦 1/2 Dispatching pull_request webhook payload to DRIFT..."
curl -s -X POST "$HOST/api/webhooks/github" \
  -H "Content-Type: application/json" \
  -H "x-github-event: pull_request" \
  -H "x-hub-signature-256: sha256=mock_presentation_sig" \
  -d '{
    "action": "opened",
    "pull_request": {
      "number": 501,
      "title": "PR #501: Change Order Amount Schema from Integer to String",
      "head": { "sha": "e9a21b4" }
    },
    "repository": {
      "name": "orders-checkout-service",
      "full_name": "acme/orders-checkout-service"
    }
  }' | grep -o '"ok":true' && echo "  ✅ Webhook accepted by DRIFT Sentinel."

echo ""

# 2. Ingest Classified Report
echo "📊 2/2 Ingesting breaking contract report into database..."
curl -s -X POST "$HOST/api/reports" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "prj_orders_checkout",
    "prTitle": "PR #501: Change Order Amount Schema from Integer to String",
    "severity": "CRITICAL_BREAKING",
    "safeCount": 2,
    "warningCount": 0,
    "breakingCount": 1,
    "jsonPayload": "{\"changes\":[{\"field\":\"Order.amount\",\"from\":\"integer\",\"to\":\"string\",\"classification\":\"CRITICAL_BREAKING\"}]}"
  }' | grep -o '"id":' && echo "  ✅ Report saved into PostgreSQL database."

echo ""
echo "🎉 Live simulation complete! Refresh http://localhost:3000/dashboard or http://localhost:5555 to view the new live record."
