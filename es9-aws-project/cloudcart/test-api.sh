#!/bin/bash

# CloudCart API Test Script
# Usage: ./test-api.sh <API_URL>

set -e

API_URL=${1:-$API}

if [ -z "$API_URL" ]; then
    echo "Error: API URL required"
    echo "Usage: ./test-api.sh <API_URL>"
    echo "Or set API environment variable: export API=https://..."
    exit 1
fi

echo "================================"
echo "CloudCart API Test Suite"
echo "================================"
echo "API URL: $API_URL"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function to test endpoint
test_endpoint() {
    TESTS_RUN=$((TESTS_RUN + 1))
    local TEST_NAME=$1
    local METHOD=$2
    local ENDPOINT=$3
    local DATA=$4
    local EXPECTED_CODE=$5

    echo -n "Testing: $TEST_NAME... "

    if [ -z "$DATA" ]; then
        RESPONSE=$(curl -s -w "\n%{http_code}" -X $METHOD "$API_URL$ENDPOINT")
    else
        RESPONSE=$(curl -s -w "\n%{http_code}" -X $METHOD "$API_URL$ENDPOINT" \
            -H 'Content-Type: application/json' \
            -d "$DATA")
    fi

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | head -n-1)

    if [ "$HTTP_CODE" == "$EXPECTED_CODE" ]; then
        echo -e "${GREEN}✓ PASS${NC} (HTTP $HTTP_CODE)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC} (Expected $EXPECTED_CODE, got $HTTP_CODE)"
        echo "Response: $BODY"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

echo "================================"
echo "1. Products Endpoints"
echo "================================"

test_endpoint "List all products" GET "/products" "" "200"
test_endpoint "Get product by ID (existing)" GET "/products/1" "" "200"
test_endpoint "Get product by ID (non-existing)" GET "/products/999" "" "404"
test_endpoint "List by category" GET "/categories/electronics" "" "200"

echo ""
echo "================================"
echo "2. Cart Endpoints"
echo "================================"

test_endpoint "View empty cart" GET "/cart" "" "200"
test_endpoint "Add item to cart" POST "/cart" '{"id":"1","qty":2}' "200"
test_endpoint "View cart with items" GET "/cart" "" "200"
test_endpoint "Add another item" POST "/cart" '{"id":"2","qty":1}' "200"
test_endpoint "Remove item from cart" DELETE "/cart" '{"id":"1"}' "200"
test_endpoint "Add item (missing qty)" POST "/cart" '{"id":"1"}' "400"

echo ""
echo "================================"
echo "3. Checkout Endpoint"
echo "================================"

test_endpoint "Checkout with valid data" POST "/checkout" \
    '{"userId":"test-user","items":[{"id":"1","qty":2}],"total":199.99}' "202"

test_endpoint "Checkout with empty order" POST "/checkout" \
    '{"userId":"test-user","items":[],"total":0}' "202"

echo ""
echo "================================"
echo "4. S3 Image Upload"
echo "================================"

test_endpoint "Get presigned upload URL" POST "/products/1/upload-url" "" "200"

echo ""
echo "================================"
echo "5. Orders Endpoints"
echo "================================"

# Give worker time to process orders
echo "Waiting 5 seconds for order processing..."
sleep 5

test_endpoint "List orders" GET "/orders?userId=test-user" "" "200"
test_endpoint "List all orders (admin)" GET "/orders?userId=all" "" "200"

echo ""
echo "================================"
echo "6. Admin Endpoints (No Auth)"
echo "================================"

test_endpoint "Create product (no API key)" POST "/admin/products" \
    '{"id":"10","name":"Test","price":99.99,"category":"test"}' "401"

test_endpoint "Update product (no API key)" PATCH "/admin/products/1" \
    '{"price":79.99}' "401"

test_endpoint "Delete product (no API key)" DELETE "/admin/products/1" "" "401"

echo ""
echo "================================"
echo "7. Admin Endpoints (Customer Key)"
echo "================================"

CUSTOMER_KEY="customer-key-cloudcart-2024"

echo -n "Testing: Create product (customer key)... "
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/admin/products" \
    -H "x-api-key: $CUSTOMER_KEY" \
    -H 'Content-Type: application/json' \
    -d '{"id":"11","name":"Test","price":99.99,"category":"test"}')
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

if [ "$HTTP_CODE" == "403" ] || [ "$HTTP_CODE" == "401" ]; then
    echo -e "${GREEN}✓ PASS${NC} (Correctly denied: HTTP $HTTP_CODE)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗ FAIL${NC} (Expected 403/401, got $HTTP_CODE)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi
TESTS_RUN=$((TESTS_RUN + 1))

echo ""
echo "================================"
echo "8. Admin Endpoints (Admin Key)"
echo "================================"

ADMIN_KEY="admin-key-cloudcart-2024"

echo -n "Testing: Create product (admin key)... "
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/admin/products" \
    -H "x-api-key: $ADMIN_KEY" \
    -H 'Content-Type: application/json' \
    -d '{"id":"100","name":"Test Product","price":99.99,"category":"test"}')
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

if [ "$HTTP_CODE" == "201" ]; then
    echo -e "${GREEN}✓ PASS${NC} (HTTP $HTTP_CODE)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗ FAIL${NC} (Expected 201, got $HTTP_CODE)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi
TESTS_RUN=$((TESTS_RUN + 1))

echo -n "Testing: Update product (admin key)... "
RESPONSE=$(curl -s -w "\n%{http_code}" -X PATCH "$API_URL/admin/products/100" \
    -H "x-api-key: $ADMIN_KEY" \
    -H 'Content-Type: application/json' \
    -d '{"price":89.99}')
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

if [ "$HTTP_CODE" == "200" ]; then
    echo -e "${GREEN}✓ PASS${NC} (HTTP $HTTP_CODE)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗ FAIL${NC} (Expected 200, got $HTTP_CODE)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi
TESTS_RUN=$((TESTS_RUN + 1))

echo -n "Testing: Delete product (admin key)... "
RESPONSE=$(curl -s -w "\n%{http_code}" -X DELETE "$API_URL/admin/products/100" \
    -H "x-api-key: $ADMIN_KEY")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

if [ "$HTTP_CODE" == "200" ]; then
    echo -e "${GREEN}✓ PASS${NC} (HTTP $HTTP_CODE)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗ FAIL${NC} (Expected 200, got $HTTP_CODE)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi
TESTS_RUN=$((TESTS_RUN + 1))

echo ""
echo "================================"
echo "Test Summary"
echo "================================"
echo "Total tests: $TESTS_RUN"
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    exit 1
fi
