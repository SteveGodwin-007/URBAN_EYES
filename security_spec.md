# Security Specification for Chennai Smart Pothole Monitor

## 1. Data Invariants
- A pothole record MUST have a valid geolocation (lat: -90 to 90, lon: -180 to 180).
- A pothole record MUST have a status from the predefined enum.
- A pothole record MUST have a severity from the predefined enum.
- Timestamps must be valid ISO strings or server timestamps.
- Confidence must be between 0 and 1.
- `busRouteId` is mandatory and must be a string.

## 2. Access Control Matrix
| Collection | Create | Read | Update | Delete |
|------------|--------|------|--------|--------|
| potholes   | Allow (Validated) | Public | Allow (Restricted Fields) | Deny |

## 3. The "Dirty Dozen" (Test Payloads)
1. **Invalid Latitude**: `{"location": {"latitude": 100, "longitude": 80}}` -> DENIED
2. **Invalid Status**: `{"status": "FIXED_BY_AI"}` -> DENIED
3. **Missing Route**: `{"busRouteId": null}` -> DENIED
4. **Huge Remarks**: `{"remarks": "A" * 10000}` -> DENIED
5. **Unauthorized Field Update**: Changing `confidence` in an update block. -> DENIED
6. **Poisoned ID**: Document ID with malicious characters. -> DENIED
7. **Invalid Confidence**: `{"confidence": 1.5}` -> DENIED
8. **Invalid Severity**: `{"severity": "SUPER_BAD"}` -> DENIED
9. **Negative Timestamp**: `{"timestamp": -1}` -> DENIED
10. **Shadow Key**: `{"ghost_verify": true}` -> DENIED
11. **Spoofed Owner**: `{"ownerId": "someone_else"}` (if identity was used) -> DENIED
12. **Status Skipping**: Skipping from DETECTED to ACTION_TAKEN without VIEWED (if enforced). -> DENIED

## 4. Implementation Strategy
- Use `isValidPothole()` helper for all writes.
- Use `affectedKeys().hasOnly()` for updates.
- Enforce string size limits on all fields.
