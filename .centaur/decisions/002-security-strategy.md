# ADR 002: Security Improvement Strategy

**Status:** Accepted

**Date:** 2026-03-03

**Deciders:** Development team

**Related:** [ADR-001](./001-baseline-architecture.md), [Security Audit](../audit/security-audit-2026-03-03.md)

---

## Context

Security audit revealed **3 critical vulnerabilities** that block production deployment:

1. **Exposed Firebase Configuration** — API keys visible in source code
2. **Plain-Text Password Storage** — Passwords readable in localStorage
3. **No Server-Side Validation** — All checks bypassable via browser DevTools

**Current Security Grade:** 🔴 **D** (critical gaps present)

**Target Security Grade:** 🟢 **B+** (acceptable for MVP deployment)

**Timeline:** Must be resolved within 1 week to proceed with deployment plans.

---

## Decision

We will implement a **three-phase security remediation strategy**, prioritizing immediate critical fixes followed by best-practice improvements.

### Phase 1: Environment Configuration (P0 — Day 1-2)

**Decision:** Move all sensitive configuration to environment variables.

**Implementation:**
1. Create `.env` file (gitignored)
   ```env
   VITE_FIREBASE_API_KEY=AIzaSyDavjrx2ZmJ5dQzw3bMm-lB-MPqAny6CL8
   VITE_FIREBASE_AUTH_DOMAIN=ridematch-test-3eebc.firebaseapp.com
   VITE_FIREBASE_DATABASE_URL=https://ridematch-test-3eebc-default-rtdb.firebaseio.com
   VITE_FIREBASE_PROJECT_ID=ridematch-test-3eebc
   VITE_FIREBASE_STORAGE_BUCKET=ridematch-test-3eebc.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID=624217382244
   VITE_FIREBASE_APP_ID=1:624217382244:web:204c143d76b0ea01646e71
   VITE_FIREBASE_MEASUREMENT_ID=G-WRXCEM38WV
   VITE_GOOGLE_MAPS_API_KEY=[key]
   ```

2. Create `.env.example` (committed to repo)
   ```env
   VITE_FIREBASE_API_KEY=your_firebase_api_key_here
   VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   # ... (template with instructions)
   ```

3. Update `app.js` to read from environment
   ```javascript
   const FIREBASE_CONFIG = {
     apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
     authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
     // ...
   };
   ```

4. Add to `.gitignore`:
   ```
   .env
   .env.local
   ```

**Why environment variables:**
- Industry standard practice
- Separates config from code
- Different configs for dev/staging/prod
- Prevents accidental commits of secrets

**Effort:** 1-2 hours

### Phase 2: Authentication Security (P0 — Day 3-5)

**Decision:** Migrate to **Firebase Authentication** (not client-side hashing).

**Why Firebase Auth (not bcrypt hashing):**

| Factor | Client-Side bcrypt | Firebase Authentication |
|--------|-------------------|-------------------------|
| **Security** | 🟡 Hashes in localStorage (still visible) | ✅ No passwords stored client-side |
| **Session Management** | ❌ Manual implementation needed | ✅ Built-in with automatic refresh |
| **Token Handling** | ❌ Must build from scratch | ✅ Cryptographically signed JWTs |
| **Effort** | 🟡 2-3 hours (quick fix) | 🟡 4-6 hours (proper solution) |
| **Long-Term** | 🔴 Still not truly secure | ✅ Industry standard |
| **Features** | ❌ Email verification, password reset manual | ✅ Built-in features |

**Implementation Plan:**

1. **Install Firebase Auth SDK** (already included in Firebase)
   ```javascript
   import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
   ```

2. **Refactor Registration** (app.js ~line 257)
   ```javascript
   async function handleRegister() {
     const email = $('#reg-email').value.trim();
     const password = $('#reg-password').value;
     const name = $('#reg-name').value.trim();
     const neighborhood = $('#reg-neighborhood').value.trim();

     try {
       // Create Firebase Auth user
       const userCredential = await createUserWithEmailAndPassword(auth, email, password);
       const uid = userCredential.user.uid;

       // Store profile data in Realtime Database (NOT password)
       const userProfile = {
         id: uid,
         name,
         email,
         neighborhood,
         phone: '',
         createdAt: new Date().toISOString(),
       };

       await firebase.database().ref(`ridematch/users/${uid}`).set(userProfile);

       // Save to local state
       currentUser = userProfile;
       saveCurrentUser(userProfile);

       toast('Registration successful!', 'success');
       navigateTo('dashboard');
     } catch (err) {
       if (err.code === 'auth/email-already-in-use') {
         toast('Email already registered', 'error');
       } else {
         toast(`Registration failed: ${err.message}`, 'error');
       }
     }
   }
   ```

3. **Refactor Login** (app.js ~line 215)
   ```javascript
   async function handleLogin() {
     const email = $('#login-email').value.trim();
     const password = $('#login-password').value;

     try {
       // Firebase Auth handles password verification
       const userCredential = await signInWithEmailAndPassword(auth, email, password);
       const uid = userCredential.user.uid;

       // Fetch user profile from database
       const snapshot = await firebase.database().ref(`ridematch/users/${uid}`).once('value');
       const userProfile = snapshot.val();

       if (!userProfile) {
         toast('User profile not found', 'error');
         return;
       }

       currentUser = userProfile;
       saveCurrentUser(userProfile);

       toast(`Welcome back, ${userProfile.name}!`, 'success');
       navigateTo('dashboard');
     } catch (err) {
       if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
         toast('Invalid email or password', 'error');
       } else {
         toast(`Login failed: ${err.message}`, 'error');
       }
     }
   }
   ```

4. **Add Session Persistence**
   ```javascript
   // Check if user is already logged in on page load
   firebase.auth().onAuthStateChanged(async (user) => {
     if (user) {
       // User is signed in, fetch profile
       const snapshot = await firebase.database().ref(`ridematch/users/${user.uid}`).once('value');
       currentUser = snapshot.val();
       saveCurrentUser(currentUser);
       navigateTo('dashboard');
     } else {
       // User is signed out
       currentUser = null;
       clearCurrentUser();
     }
   });
   ```

5. **Remove password field from database**
   - Delete `password` property from all stored user objects
   - Update user profile editing to not handle passwords
   - Password changes handled via Firebase Auth: `updatePassword(user, newPassword)`

**Migration Strategy:**
- Existing users must re-register (small user base)
- Or: One-time migration script if user base is large

**Effort:** 4-6 hours (includes testing)

### Phase 3: Server-Side Validation (P0 — Day 6-7)

**Decision:** Implement **Firebase Security Rules** to enforce data integrity.

**Why Security Rules:**
- Server-side enforcement (cannot be bypassed by client)
- Declarative syntax (easy to understand)
- Real-time validation (checked on every write)
- No backend code needed

**Implementation:**

Create `firebase-rules.json`:
```json
{
  "rules": {
    "ridematch": {
      "users": {
        "$userId": {
          ".read": "auth != null && auth.uid == $userId",
          ".write": "auth != null && auth.uid == $userId",
          ".validate": "newData.hasChildren(['name', 'email', 'neighborhood']) &&
                        newData.child('email').isString() &&
                        newData.child('name').isString() &&
                        newData.child('neighborhood').isString()"
        }
      },
      "rides": {
        "$rideId": {
          ".read": "auth != null",
          ".write": "auth != null && (
            !data.exists() ||
            data.child('driverId').val() == auth.uid
          )",
          ".validate": "newData.hasChildren(['driverId', 'date', 'time', 'totalSeats', 'availableSeats', 'direction', 'origin']) &&
                        newData.child('totalSeats').isNumber() &&
                        newData.child('totalSeats').val() >= 1 &&
                        newData.child('totalSeats').val() <= 10 &&
                        newData.child('availableSeats').isNumber() &&
                        newData.child('availableSeats').val() >= 0 &&
                        newData.child('availableSeats').val() <= newData.child('totalSeats').val()"
        }
      },
      "requests": {
        ".read": "auth != null",
        ".write": "auth != null",
        ".validate": "newData.hasChildren(['rideId', 'riderId', 'status'])"
      },
      "notifications": {
        "$userId": {
          "$notifId": {
            ".read": "auth != null && auth.uid == $userId",
            ".write": "auth != null"
          }
        }
      },
      "messages": {
        "$rideId": {
          "$messageId": {
            ".read": "auth != null",
            ".write": "auth != null && newData.child('senderId').val() == auth.uid"
          }
        }
      },
      "ratings": {
        "$ratingId": {
          ".read": "auth != null",
          ".write": "auth != null && !data.exists()"
        }
      }
    }
  }
}
```

**Key Rules:**
1. **Authentication Required:** All reads/writes require `auth != null`
2. **User Data Privacy:** Users can only read/write their own profile
3. **Ride Ownership:** Only ride creator can modify their rides
4. **Data Validation:** Seat counts must be 1-10, available ≤ total
5. **Message Integrity:** Sender ID must match authenticated user
6. **Rating Immutability:** Ratings can only be written once

**Deployment:**
```bash
firebase deploy --only database
```

**Testing:**
1. Attempt to read rides without authentication → should fail
2. Attempt to modify another user's ride → should fail
3. Attempt to create ride with 100 seats → should fail
4. All legitimate operations should still work

**Effort:** 2-3 hours (write + test + deploy)

---

## Alternatives Considered

### Alternative 1: Build Custom Backend
- **Description:** Node.js/Express server with proper authentication
- **Pros:**
  - Complete control
  - Custom business logic
  - Can add complex features
- **Cons:**
  - Weeks of development
  - Server hosting costs
  - Maintenance burden
  - Over-engineering for current needs
- **Why not chosen:** Firebase handles this already. Don't rebuild what exists.

### Alternative 2: Keep Client-Side Only + Add Hashing
- **Description:** Hash passwords with bcrypt.js, keep localStorage auth
- **Pros:**
  - Quick fix (2-3 hours)
  - Minimal code changes
- **Cons:**
  - Hashes still visible in localStorage
  - No proper session management
  - Not truly secure
  - Band-aid solution
- **Why not chosen:** Firebase Auth is barely more effort and far more secure.

### Alternative 3: Use Auth0 or Other Auth Provider
- **Description:** Third-party authentication service
- **Pros:**
  - Enterprise-grade security
  - Many features (social login, MFA, etc.)
- **Cons:**
  - Additional dependency
  - Costs money at scale
  - More complex integration
  - Already using Firebase
- **Why not chosen:** Firebase Auth is sufficient and already integrated.

---

## Consequences

### Positive
- ✅ **Critical Vulnerabilities Fixed:** All P0 security issues resolved
- ✅ **Industry Standard:** Firebase Auth is battle-tested
- ✅ **Built-In Features:** Email verification, password reset, session management
- ✅ **Server-Side Security:** Cannot bypass validation
- ✅ **Audit-Ready:** Can pass basic security review
- ✅ **Environment Best Practices:** Proper config management

### Negative
- 🔴 **Breaking Change:** Existing users must re-register (small impact if user base is tiny)
- 🟡 **Refactoring Effort:** 7-10 hours total work
- 🟡 **Testing Required:** Must verify all auth flows work
- 🟡 **Firebase Dependency:** Locked into Firebase ecosystem

### Neutral
- ⚪ **Migration Complexity:** Depends on current user count
- ⚪ **Learning Curve:** Team must understand Firebase Auth API

---

## Implementation Notes

### Order of Operations
1. **DO NOT start with Phase 2 first** — will break app while implementing
2. Complete Phase 1 (env vars) → test → commit
3. Complete Phase 2 (Firebase Auth) → test thoroughly → commit
4. Complete Phase 3 (Security Rules) → test → deploy to Firebase

### Testing Checklist
- [ ] Registration with valid data works
- [ ] Registration with invalid data fails gracefully
- [ ] Login with correct credentials works
- [ ] Login with wrong password fails
- [ ] Session persists across page reloads
- [ ] Logout clears session properly
- [ ] Can't read rides without authentication
- [ ] Can't modify other users' rides
- [ ] Seat validation enforced by Firebase Rules
- [ ] Firebase Rules deployed and active

### Documentation Updates
After implementation:
- [ ] Update README.md with `.env` setup instructions
- [ ] Document Firebase project configuration
- [ ] Add troubleshooting guide for auth issues
- [ ] Update Sprint Log with security grade improvement

---

## Compliance

**Security Requirements:**
- All Firebase API keys in environment variables (not source code)
- All user passwords handled by Firebase Auth (never stored client-side)
- All data writes validated by Firebase Security Rules

**Verification:**
- `git grep` for hardcoded API keys → should return 0 results
- Check localStorage → should contain NO password fields
- Attempt to bypass validation → Firebase should reject writes

---

## Review

**Success Criteria:**
- Security audit grade improves from 🔴 D → 🟢 B+ or better
- All critical vulnerabilities marked as **RESOLVED**
- App passes Firebase security best practices review

**Next Review:** After implementation (estimated 1 week)

**Triggers for Re-evaluation:**
- New security vulnerabilities discovered
- Firebase Auth proves insufficient for new requirements
- Migration to different authentication system proposed

---

**References:**
- [Firebase Authentication Documentation](https://firebase.google.com/docs/auth)
- [Firebase Security Rules Guide](https://firebase.google.com/docs/database/security)
- [Security Audit Report](../audit/security-audit-2026-03-03.md)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
