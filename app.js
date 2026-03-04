/* =============================================
   CarPooling App — Application Logic
   ============================================= */

(function () {
  'use strict';

  // =========================================
  //  FIREBASE CONFIG
  //  ⚠️ SECURITY: Configuration loaded from config.js (gitignored)
  //
  //  Setup:
  //  1. Copy config.example.js to config.js
  //  2. Fill in your Firebase project credentials
  //  3. Load config.js in index.html before app.js
  //
  //  See README.md for complete setup instructions
  // =========================================
  const FIREBASE_CONFIG = window.CONFIG ? window.CONFIG.firebase : null;

  const FIREBASE_SYNC_KEYS = ['users', 'rides', 'requests', 'notifications', 'ratings', 'messages'];
  let firebaseDB = null;
  let firebaseAuth = null;

  async function initFirebaseSync() {
    if (!FIREBASE_CONFIG || typeof firebase === 'undefined') return;
    try {
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      firebaseDB = firebase.database();
      firebaseAuth = firebase.auth();

      // Pull all data from Firebase into localStorage before app starts
      for (const key of FIREBASE_SYNC_KEYS) {
        const snap = await firebaseDB.ref(`ridematch/${key}`).get();
        if (snap.exists()) {
          const val = snap.val();
          localStorage.setItem(`ridematch_${key}`, typeof val === 'string' ? val : JSON.stringify(val));
        }
      }

      // Listen for changes made by OTHER users and update local state
      firebaseDB.ref('ridematch').on('value', (snapshot) => {
        if (!snapshot.exists()) return;
        const data = snapshot.val();
        FIREBASE_SYNC_KEYS.forEach(key => {
          if (data[key] !== undefined) {
            const val = data[key];
            localStorage.setItem(`ridematch_${key}`, typeof val === 'string' ? val : JSON.stringify(val));
          }
        });
        if (!currentUser) return;
        updateNotificationBadge();
        // Re-render current page unless user is mid-action
        const anyOverlayOpen = ['ride-modal', 'profile-modal', 'tracking-overlay', 'chat-overlay']
          .some(id => !document.getElementById(id).classList.contains('hidden'));
        if (!anyOverlayOpen && currentPage !== 'offer') navigateTo(currentPage);
      });

      console.log('[RideMatch] Firebase sync active');
    } catch (err) {
      console.warn('[RideMatch] Firebase sync unavailable, running offline:', err.message);
    }
  }

  function syncToFirebase(storageKey, data) {
    if (!firebaseDB) return;
    const fbKey = storageKey.replace('ridematch_', '');
    if (FIREBASE_SYNC_KEYS.includes(fbKey)) {
      firebaseDB.ref(`ridematch/${fbKey}`).set(JSON.stringify(data)).catch(() => {});
    }
  }

  // =========================================
  //  DATA LAYER (localStorage)
  // =========================================
  const STORAGE_KEYS = {
    users: 'ridematch_users',
    rides: 'ridematch_rides',
    requests: 'ridematch_requests',
    notifications: 'ridematch_notifications',
    currentUser: 'ridematch_current_user',
    ratings: 'ridematch_ratings',
    messages: 'ridematch_messages',
  };

  // Default work location (configurable)
  const WORK_LOCATION = window.CONFIG ? window.CONFIG.workLocation : { lat: 9.9981, lng: -84.1315 };

  const DARK_MAP_STYLES = [
    { elementType: 'geometry', stylers: [{ color: '#1d1d2e' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#1d1d2e' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#8892b0' }] },
    { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#2d2d44' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2a2a3d' }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#353550' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#333355' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e3454' }] },
    { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#242438' }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1a3320' }] },
    { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#242438' }] },
  ];

  function loadData(key) {
    try {
      return JSON.parse(localStorage.getItem(key)) || [];
    } catch { return []; }
  }
  function saveData(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
    syncToFirebase(key, data);
  }
  function loadCurrentUser() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.currentUser));
    } catch { return null; }
  }
  function saveCurrentUser(user) {
    localStorage.setItem(STORAGE_KEYS.currentUser, JSON.stringify(user));
  }
  function clearCurrentUser() {
    localStorage.removeItem(STORAGE_KEYS.currentUser);
  }

  // Unique ID generator
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // =========================================
  //  STATE
  // =========================================
  let currentUser = loadCurrentUser();
  let currentPage = 'dashboard';

  // Chat state
  let chatPollTimer = null;
  let chatCurrentRideId = null;

  // Maps state
  let trackingState = {
    map: null, directionsRenderer: null, driverMarker: null,
    routePoints: [], currentIndex: 0, watchId: null,
    animationFrame: null, isTracking: false, mode: 'demo',
    currentRide: null, totalDistance: 0, totalDuration: 0,
  };

  // =========================================
  //  DOM REFERENCES
  // =========================================
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const authScreen = $('#auth-screen');
  const appScreen = $('#app-screen');
  const loginForm = $('#login-form');
  const registerForm = $('#register-form');

  // =========================================
  //  INITIALIZATION
  // =========================================
  function init() {
    // Set up Firebase Auth session persistence
    if (firebaseAuth) {
      firebaseAuth.onAuthStateChanged(async (user) => {
        if (user) {
          // User is signed in - fetch profile from database
          if (firebaseDB) {
            const snapshot = await firebaseDB.ref(`ridematch/users/${user.uid}`).once('value');
            if (snapshot.exists()) {
              currentUser = snapshot.val();
              saveCurrentUser(currentUser);
              showApp();
              updateNotificationBadge();
            } else {
              // User authenticated but no profile - sign out
              await firebaseAuth.signOut();
              showAuth();
            }
          }
        } else {
          // User is signed out
          if (!currentUser) {
            showAuth();
          }
        }
      });
    } else {
      // Fallback: check localStorage
      if (currentUser) {
        showApp();
      } else {
        showAuth();
      }
    }

    bindEvents();
    setDefaultDate();
    initMapsModule();

    // Demo mode setup
    checkDemoBannerState();
    showDemoWarningOnFirstVisit();
  }

  function setDefaultDate() {
    const today = new Date().toISOString().split('T')[0];
    const offerDate = $('#offer-date');
    const filterDate = $('#filter-date');
    if (offerDate) offerDate.value = today;
    if (filterDate) filterDate.value = '';
  }

  // =========================================
  //  AUTH
  // =========================================
  function showAuth() {
    authScreen.classList.add('active');
    appScreen.classList.remove('active');
  }

  function showApp() {
    authScreen.classList.remove('active');
    appScreen.classList.add('active');
    $('#nav-user-name').textContent = currentUser.name.split(' ')[0];
    updateGreeting();
    navigateTo('dashboard');
    updateNotificationBadge();
  }

  async function handleLogin() {
    const email = $('#login-email').value.trim().toLowerCase();
    const password = $('#login-password').value;

    if (!email || !password) {
      toast('Please fill in all fields', 'error');
      return;
    }

    // DEMO MODE: Only allow specific 28 demo accounts
    const validDemoUsers = [];
    for (let i = 1; i <= 28; i++) {
      validDemoUsers.push(`User${i}@test.com`.toLowerCase());
    }

    if (!validDemoUsers.includes(email.toLowerCase())) {
      toast('⚠️ DEMO MODE: Please select one of the 28 available demo accounts (user1@test.com - user28@test.com)', 'error');
      return;
    }

    // DEMO MODE: Only allow Password123
    if (password !== 'Password123') {
      toast('⚠️ DEMO MODE: Password must be exactly "Password123"', 'error');
      return;
    }

    // DEMO MODE: Force localStorage for demo accounts (bypass Firebase)
    const isDemoAccount = validDemoUsers.includes(email.toLowerCase());

    // Use Firebase Authentication if available (but not for demo accounts)
    if (firebaseAuth && !isDemoAccount) {
      try {
        // Firebase Auth handles password verification securely
        const userCredential = await firebaseAuth.signInWithEmailAndPassword(email, password);
        const uid = userCredential.user.uid;

        // Fetch user profile from Realtime Database
        if (firebaseDB) {
          const snapshot = await firebaseDB.ref(`ridematch/users/${uid}`).once('value');
          const userProfile = snapshot.val();

          if (!userProfile) {
            toast('User profile not found. Please contact support.', 'error');
            await firebaseAuth.signOut();
            return;
          }

          currentUser = userProfile;
          saveCurrentUser(userProfile);
          showApp();
          toast(`Welcome back, ${userProfile.name.split(' ')[0]}!`, 'success');
        }

      } catch (err) {
        console.error('Login error:', err);
        if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
          toast('Invalid email or password', 'error');
        } else if (err.code === 'auth/invalid-email') {
          toast('Invalid email address', 'error');
        } else if (err.code === 'auth/too-many-requests') {
          toast('Too many failed attempts. Please try again later.', 'error');
        } else {
          toast(`Login failed: ${err.message}`, 'error');
        }
      }
    } else {
      // Fallback to localStorage (if Firebase not configured)
      const users = loadData(STORAGE_KEYS.users);
      const user = users.find(u => u.email === email && u.password === password);

      if (!user) {
        toast('Invalid email or password', 'error');
        return;
      }

      currentUser = user;
      saveCurrentUser(user);
      showApp();
      toast(`Welcome back, ${user.name.split(' ')[0]}!`, 'success');
    }
  }

  async function handleRegister() {
    const name = $('#reg-name').value.trim();
    const email = $('#reg-email').value.trim().toLowerCase();
    const phone = $('#reg-phone').value.trim();
    const neighborhood = $('#reg-neighborhood').value.trim();
    const password = $('#reg-password').value;

    // Validation
    if (!name || !email || !neighborhood || !password) {
      toast('Please fill in all required fields', 'error');
      return;
    }

    // DEMO MODE: Only allow specific 28 demo accounts
    const validDemoUsers = [];
    for (let i = 1; i <= 28; i++) {
      validDemoUsers.push(`User${i}@test.com`.toLowerCase());
    }

    if (!validDemoUsers.includes(email.toLowerCase())) {
      toast('⚠️ DEMO MODE: Please select one of the 28 available demo accounts (user1@test.com - user28@test.com)', 'error');
      return;
    }

    // DEMO MODE: Only allow Password123
    if (password !== 'Password123') {
      toast('⚠️ DEMO MODE: Password must be exactly "Password123"', 'error');
      return;
    }

    // Use Firebase Authentication if available
    if (firebaseAuth) {
      try {
        // Create Firebase Auth user (password stored securely by Firebase)
        const userCredential = await firebaseAuth.createUserWithEmailAndPassword(email, password);
        const uid = userCredential.user.uid;

        // Store user profile in Realtime Database (NO password field)
        const userProfile = {
          id: uid,
          name,
          email,
          phone,
          neighborhood,
          createdAt: new Date().toISOString(),
        };

        // Save to Firebase Database
        if (firebaseDB) {
          await firebaseDB.ref(`ridematch/users/${uid}`).set(userProfile);
        }

        // Save to local state
        currentUser = userProfile;
        saveCurrentUser(userProfile);
        showApp();
        toast(`Welcome to RideMatch, ${name.split(' ')[0]}! 🚗`, 'success');

      } catch (err) {
        console.error('Registration error:', err);
        if (err.code === 'auth/email-already-in-use') {
          toast('An account with this email already exists', 'error');
        } else if (err.code === 'auth/weak-password') {
          toast('Password is too weak. Please use a stronger password.', 'error');
        } else if (err.code === 'auth/invalid-email') {
          toast('Invalid email address', 'error');
        } else {
          toast(`Registration failed: ${err.message}`, 'error');
        }
      }
    } else {
      // Fallback to localStorage (if Firebase not configured)
      const users = loadData(STORAGE_KEYS.users);
      if (users.find(u => u.email === email)) {
        toast('An account with this email already exists', 'error');
        return;
      }

      const newUser = {
        id: uid(),
        name,
        email,
        phone,
        neighborhood,
        password, // ⚠️ Still plain-text in fallback mode
        createdAt: new Date().toISOString(),
      };

      users.push(newUser);
      saveData(STORAGE_KEYS.users, users);
      currentUser = newUser;
      saveCurrentUser(newUser);
      showApp();
      toast(`Welcome to RideMatch, ${name.split(' ')[0]}! 🚗`, 'success');
    }
  }

  async function handleLogout() {
    try {
      // Sign out from Firebase Auth if available
      if (firebaseAuth) {
        await firebaseAuth.signOut();
      }

      clearCurrentUser();
      currentUser = null;
      showAuth();

      // Clear form fields
      $('#login-email').value = '';
      $('#login-password').value = '';

      toast('Signed out successfully', 'info');
    } catch (err) {
      console.error('Logout error:', err);
      toast('Error signing out', 'error');
    }
  }

  // =========================================
  //  DEMO MODE WARNINGS
  // =========================================
  function showDemoWarningOnFirstVisit() {
    const hasSeenWarning = localStorage.getItem('demo-warning-seen');
    if (!hasSeenWarning) {
      const modal = $('#demo-warning-modal');
      if (modal) {
        modal.classList.remove('hidden');
      }
    }
  }

  window.closeDemoWarningModal = function() {
    const modal = $('#demo-warning-modal');
    if (modal) {
      modal.classList.add('hidden');
      localStorage.setItem('demo-warning-seen', 'true');
    }
  };

  window.closeDemoBanner = function() {
    const banner = $('#demo-banner');
    if (banner) {
      banner.style.display = 'none';
      localStorage.setItem('demo-banner-closed', 'true');
    }
  };

  // Check if banner was previously closed
  function checkDemoBannerState() {
    const bannerClosed = localStorage.getItem('demo-banner-closed');
    if (bannerClosed === 'true') {
      const banner = $('#demo-banner');
      if (banner) {
        banner.style.display = 'none';
      }
    }
  }

  // =========================================
  //  NAVIGATION
  // =========================================
  function navigateTo(page) {
    currentPage = page;

    // Update pages
    $$('.page').forEach(p => p.classList.remove('active'));
    const target = $(`#page-${page}`);
    if (target) target.classList.add('active');

    // Update nav
    $$('.nav-item').forEach(n => n.classList.remove('active'));
    const navItem = $(`.nav-item[data-page="${page}"]`);
    if (navItem) navItem.classList.add('active');

    // Render page content
    switch (page) {
      case 'dashboard': renderDashboard(); break;
      case 'find': renderFindRides(); break;
      case 'myrides': renderMyRides(); break;
      case 'notifications': renderNotifications(); break;
      case 'offer': prepareOfferForm(); break;
    }
  }

  // =========================================
  //  GREETING
  // =========================================
  function updateGreeting() {
    const hour = new Date().getHours();
    let greeting = 'Good evening';
    if (hour < 12) greeting = 'Good morning';
    else if (hour < 18) greeting = 'Good afternoon';

    const el = $('#dashboard-greeting');
    if (el && currentUser) {
      el.textContent = `${greeting}, ${currentUser.name.split(' ')[0]}!`;
    }
  }

  // =========================================
  //  OFFER A RIDE
  // =========================================
  const WORK_ADDRESS = 'Workplace Address';

  function prepareOfferForm() {
    const today = new Date().toISOString().split('T')[0];
    const offerDate = $('#offer-date');
    if (offerDate && !offerDate.value) offerDate.value = today;

    const fromInput = $('#offer-from');
    const toInput = $('#offer-to');

    // Pre-fill From with user's neighborhood, To with work location
    if (fromInput && !fromInput.value && currentUser) {
      fromInput.value = currentUser.neighborhood || '';
    }
    if (toInput && !toInput.value) {
      toInput.value = WORK_ADDRESS;
      toInput.dataset.lat = String(WORK_LOCATION.lat);
      toInput.dataset.lng = String(WORK_LOCATION.lng);
      toInput.dataset.address = WORK_ADDRESS;
      toInput.dataset.isIbm = 'true';
    }

    initPlacesAutocomplete(fromInput);
    initPlacesAutocomplete(toInput);
  }

  function swapOfferLocations() {
    const fromInput = $('#offer-from');
    const toInput = $('#offer-to');

    const tmpVal = fromInput.value;
    const tmpLat = fromInput.dataset.lat;
    const tmpLng = fromInput.dataset.lng;
    const tmpAddr = fromInput.dataset.address;
    const tmpIsIbm = fromInput.dataset.isIbm;

    fromInput.value = toInput.value;
    fromInput.dataset.lat = toInput.dataset.lat || '';
    fromInput.dataset.lng = toInput.dataset.lng || '';
    fromInput.dataset.address = toInput.dataset.address || '';
    fromInput.dataset.isIbm = toInput.dataset.isIbm || '';

    toInput.value = tmpVal;
    toInput.dataset.lat = tmpLat || '';
    toInput.dataset.lng = tmpLng || '';
    toInput.dataset.address = tmpAddr || '';
    toInput.dataset.isIbm = tmpIsIbm || '';
  }

  function handleOfferRide(e) {
    e.preventDefault();

    const fromInput = $('#offer-from');
    const toInput = $('#offer-to');
    const fromVal = fromInput.value.trim();
    const toVal = toInput.value.trim();
    const date = $('#offer-date').value;
    const time = $('#offer-time').value;
    const seats = parseInt($('#offer-seats').value);
    const notes = $('#offer-notes').value.trim();

    if (!fromVal || !toVal || !date || !time) {
      toast('Please fill in all required fields', 'error');
      return;
    }

    // Infer direction: whichever field has work address is the work endpoint
    const toIsIbm = toInput.dataset.isIbm === 'true' || toVal.toLowerCase().includes('ibm');
    const fromIsIbm = fromInput.dataset.isIbm === 'true' || fromVal.toLowerCase().includes('ibm');

    let direction, origin, originLat, originLng, originAddress, destination;

    if (toIsIbm) {
      direction = 'to-ibm';
      origin = fromVal;
      originLat = fromInput.dataset.lat || null;
      originLng = fromInput.dataset.lng || null;
      originAddress = fromInput.dataset.address || fromVal;
      destination = toVal;
    } else if (fromIsIbm) {
      direction = 'from-ibm';
      origin = toVal;
      originLat = toInput.dataset.lat || null;
      originLng = toInput.dataset.lng || null;
      originAddress = toInput.dataset.address || toVal;
      destination = fromVal;
    } else {
      // Neither field has IBM — use To as destination, From as origin
      direction = 'to-ibm';
      origin = fromVal;
      originLat = fromInput.dataset.lat || null;
      originLng = fromInput.dataset.lng || null;
      originAddress = fromInput.dataset.address || fromVal;
      destination = toVal;
    }

    const ride = {
      id: uid(),
      driverId: currentUser.id,
      driverName: currentUser.name,
      driverEmail: currentUser.email,
      driverPhone: currentUser.phone,
      direction,
      origin,
      originLat,
      originLng,
      originAddress,
      destination,
      fromLabel: fromVal,
      toLabel: toVal,
      date,
      time,
      totalSeats: seats,
      availableSeats: seats,
      notes,
      riders: [],
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    const rides = loadData(STORAGE_KEYS.rides);
    rides.push(ride);
    saveData(STORAGE_KEYS.rides, rides);

    $('#offer-form').reset();
    delete $('#offer-from').dataset.lat;
    delete $('#offer-from').dataset.lng;
    delete $('#offer-to').dataset.lat;
    delete $('#offer-to').dataset.lng;
    delete $('#offer-to').dataset.isIbm;
    setDefaultDate();

    toast('Ride posted successfully!', 'success');
    navigateTo('myrides');
  }

  // =========================================
  //  FIND RIDES
  // =========================================
  function renderFindRides() {
    const rides = loadData(STORAGE_KEYS.rides);
    const container = $('#rides-list');
    const dirFilter = $('#filter-direction').value;
    const searchFilter = $('#filter-search').value.trim().toLowerCase();
    const dateFilter = $('#filter-date').value;

    const today = new Date().toISOString().split('T')[0];

    let filtered = rides.filter(r => {
      if (r.driverId === currentUser.id) return false; // Don't show own rides
      if (r.status !== 'active') return false;
      if (r.date < today) return false; // Don't show past rides
      if (dirFilter !== 'all' && r.direction !== dirFilter) return false;
      if (searchFilter && !r.origin.toLowerCase().includes(searchFilter)) return false;
      if (dateFilter && r.date !== dateFilter) return false;
      return true;
    });

    // Sort by date/time
    filtered.sort((a, b) => {
      const da = a.date + a.time;
      const db = b.date + b.time;
      return da.localeCompare(db);
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <p>No rides found</p>
          <span>${searchFilter || dateFilter ? 'Try adjusting your filters' : 'Check back later or offer your own ride!'}</span>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(ride => renderRideCard(ride)).join('');

    // Bind click events
    container.querySelectorAll('.ride-card').forEach(card => {
      card.addEventListener('click', () => openRideModal(card.dataset.rideId));
    });
  }

  function renderRideCard(ride, overrideBadge = null) {
    const dirIcon = ride.direction === 'to-ibm' ? '🏢' : '🏠';
    const dirLabel = ride.fromLabel && ride.toLabel
      ? `${ride.fromLabel} → ${ride.toLabel}`
      : ride.direction === 'to-ibm'
        ? `${ride.origin} → IBM AFZ`
        : `IBM AFZ → ${ride.origin}`;

    let seatsClass, seatsLabel;
    if (overrideBadge) {
      seatsClass = 'badge-pending';
      seatsLabel = overrideBadge;
    } else {
      seatsClass = ride.availableSeats > 0 ? 'badge-seats' : 'badge-full';
      seatsLabel = ride.availableSeats > 0
        ? `${ride.availableSeats} seat${ride.availableSeats > 1 ? 's' : ''}`
        : 'Full';
    }

    const initials = ride.driverName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const rating = getDriverRating(ride.driverId);
    const ratingHTML = rating
      ? `<span class="driver-rating">${renderStars(rating.avg)} <span class="rating-avg">${rating.avg}</span></span>`
      : '';

    // Check if current user already requested
    const requests = loadData(STORAGE_KEYS.requests);
    const existingReq = requests.find(r => r.rideId === ride.id && r.riderId === currentUser.id);
    let requestBadge = '';
    if (existingReq) {
      requestBadge = `<span class="ride-card-badge badge-${existingReq.status}">${existingReq.status}</span>`;
    }

    return `
      <div class="ride-card glass-card" data-ride-id="${ride.id}">
        <div class="ride-card-header">
          <div class="ride-card-route">
            <span class="direction-icon">${dirIcon}</span>
            <span>${dirLabel}</span>
          </div>
          <span class="ride-card-badge ${seatsClass}">${seatsLabel}</span>
        </div>
        <div class="ride-card-details">
          <div class="ride-card-detail">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <span>${formatDate(ride.date)}</span>
          </div>
          <div class="ride-card-detail">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <span>${formatTime(ride.time)}</span>
          </div>
        </div>
        <div class="ride-card-footer">
          <div class="ride-card-driver">
            <div class="driver-avatar">${initials}</div>
            <div>
              <span class="driver-name">${ride.driverName}</span>
              ${ratingHTML}
            </div>
          </div>
          ${requestBadge}
        </div>
      </div>
    `;
  }

  // =========================================
  //  RIDE MODAL
  // =========================================
  function openRideModal(rideId) {
    const rides = loadData(STORAGE_KEYS.rides);
    const ride = rides.find(r => r.id === rideId);
    if (!ride) return;

    const requests = loadData(STORAGE_KEYS.requests);
    const isDriver = ride.driverId === currentUser.id;

    const dirIcon = ride.direction === 'to-ibm' ? '🏢' : '🏠';
    const dirLabel = ride.direction === 'to-ibm' ? 'Going to IBM' : 'Going Home';
    const routeLabel = ride.fromLabel && ride.toLabel
      ? `${ride.fromLabel} → ${ride.toLabel}`
      : ride.direction === 'to-ibm'
        ? `${ride.origin} → IBM AFZ, Building F30`
        : `IBM AFZ, Building F30 → ${ride.origin}`;

    const initials = ride.driverName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

    let ridersHTML = '';
    if (isDriver) {
      // Show ride requests
      const rideRequests = requests.filter(r => r.rideId === rideId);
      if (rideRequests.length > 0) {
        ridersHTML = `
          <div class="modal-riders">
            <h3>Ride Requests</h3>
            ${rideRequests.map(req => {
          const users = loadData(STORAGE_KEYS.users);
          const rider = users.find(u => u.id === req.riderId) || { name: 'Unknown', neighborhood: '' };
          const rInitials = rider.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
          let actions = '';
          if (req.status === 'pending') {
            actions = `
                  <div class="rider-actions">
                    <button class="btn btn-success btn-sm" onclick="window.RideMatch.handleRequest('${req.id}', 'accepted')">Accept</button>
                    <button class="btn btn-danger btn-sm" onclick="window.RideMatch.handleRequest('${req.id}', 'rejected')">Decline</button>
                  </div>
                `;
          } else {
            actions = `<span class="ride-card-badge badge-${req.status}">${req.status}</span>`;
          }
          const companionTag = req.companion
            ? `<span style="font-size:11px;color:var(--ibm-yellow)">+1 ${req.companion.name}</span>`
            : '';
          return `
                <div class="rider-item">
                  <div class="rider-info">
                    <div class="driver-avatar">${rInitials}</div>
                    <div>
                      <div class="driver-name">${rider.name}</div>
                      <div style="font-size:12px;color:var(--text-muted)">${rider.neighborhood} ${companionTag}</div>
                    </div>
                  </div>
                  ${actions}
                </div>
              `;
        }).join('')}
          </div>
        `;
      } else {
        ridersHTML = `
          <div class="modal-riders">
            <h3>Ride Requests</h3>
            <p style="color:var(--text-muted);font-size:var(--fs-sm)">No one has requested to join this ride yet.</p>
          </div>
        `;
      }
    } else {
      // Show accepted riders
      const acceptedRiders = requests.filter(r => r.rideId === rideId && r.status === 'accepted');
      if (acceptedRiders.length > 0) {
        ridersHTML = `
          <div class="modal-riders">
            <h3>Confirmed Riders (${acceptedRiders.length})</h3>
            ${acceptedRiders.map(req => {
          const users = loadData(STORAGE_KEYS.users);
          const rider = users.find(u => u.id === req.riderId) || { name: 'Unknown' };
          const rInitials = rider.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
          return `
                <div class="rider-item">
                  <div class="rider-info">
                    <div class="driver-avatar">${rInitials}</div>
                    <span class="driver-name">${rider.name}</span>
                  </div>
                </div>
              `;
        }).join('')}
          </div>
        `;
      }
    }

    // Actions
    let actionsHTML = '';
    if (isDriver) {
      const unreadChat = getUnreadChatCount(rideId);
      actionsHTML = `
        <div class="modal-actions" style="flex-direction:column;gap:var(--sp-2)">
          <button class="btn btn-chat btn-full" onclick="window.RideMatch.openChatModal('${rideId}')">
            💬 Group Chat${unreadChat > 0 ? ` <span class="chat-unread-badge">${unreadChat} new</span>` : ''}
          </button>
          <button class="btn btn-cancel-ride btn-full" onclick="window.RideMatch.cancelRide('${rideId}')">Cancel This Ride</button>
        </div>
      `;
    } else {
      const existingReq = requests.find(r => r.rideId === rideId && r.riderId === currentUser.id);
      if (existingReq) {
        if (existingReq.status === 'pending') {
          actionsHTML = `
            <div class="modal-actions">
              <button class="btn btn-secondary btn-full" disabled>⏳ Request Pending</button>
            </div>
          `;
        } else if (existingReq.status === 'accepted') {
          const unreadChat = getUnreadChatCount(rideId);
          actionsHTML = `
            <div class="modal-actions" style="flex-direction:column;gap:var(--sp-2)">
              <button class="btn btn-success btn-full" disabled>✅ You're In!</button>
              <button class="btn btn-chat btn-full" onclick="window.RideMatch.openChatModal('${rideId}')">
                💬 Open Chat${unreadChat > 0 ? ` <span class="chat-unread-badge">${unreadChat} new</span>` : ''}
              </button>
            </div>
          `;
        } else {
          actionsHTML = `
            <div class="modal-actions">
              <button class="btn btn-danger btn-full" disabled>Request Declined</button>
            </div>
          `;
        }
      } else if (ride.availableSeats > 0) {
        const canBringCompanion = ride.availableSeats >= 2;
        actionsHTML = `
          <div class="modal-actions">
            ${canBringCompanion ? `
              <div class="companion-option">
                <label class="companion-label">
                  <input type="checkbox" id="bring-companion" onchange="
                    document.getElementById('companion-name-wrap').classList.toggle('hidden', !this.checked);
                  ">
                  <span>Bring a companion <span class="companion-hint">(+1 seat)</span></span>
                </label>
                <div id="companion-name-wrap" class="hidden" style="margin-top:var(--sp-2)">
                  <input type="text" id="companion-name" placeholder="Companion's full name" class="form-input-inline" />
                </div>
              </div>
            ` : ''}
            <button class="btn btn-primary btn-full" onclick="window.RideMatch.requestRide('${rideId}')">🙋 Request to Join</button>
          </div>
        `;
      } else {
        actionsHTML = `
          <div class="modal-actions">
            <button class="btn btn-secondary btn-full" disabled>No Seats Available</button>
          </div>
        `;
      }
    }

    const modalBody = $('#modal-body');
    modalBody.innerHTML = `
      <div class="modal-ride-header">
        <h2>${routeLabel}</h2>
        <span class="direction-tag">${dirIcon} ${dirLabel}</span>
      </div>
      <div class="modal-info-grid">
        <div class="modal-info-item">
          <span class="info-label">Date</span>
          <span class="info-value">${formatDate(ride.date)}</span>
        </div>
        <div class="modal-info-item">
          <span class="info-label">Time</span>
          <span class="info-value">${formatTime(ride.time)}</span>
        </div>
        <div class="modal-info-item">
          <span class="info-label">Driver</span>
          <span class="info-value" style="display:flex;align-items:center;gap:8px">
            <span class="driver-avatar">${initials}</span> ${ride.driverName}
          </span>
        </div>
        <div class="modal-info-item">
          <span class="info-label">Available Seats</span>
          <span class="info-value">${ride.availableSeats} of ${ride.totalSeats}</span>
        </div>
      </div>
      ${ride.notes ? `<div class="modal-notes"><p>"${ride.notes}"</p></div>` : ''}
      ${ride.driverPhone ? `
        <div class="modal-info-item" style="margin-bottom:var(--sp-4)">
          <span class="info-label">Contact</span>
          <span class="info-value">${ride.driverPhone} · ${ride.driverEmail}</span>
        </div>
      ` : ''}
      ${(ride.originLat && ride.originLng) ? `
        <div class="modal-map-section">
          <h3>Route Map</h3>
          <div id="modal-map" class="modal-map"></div>
          <div id="modal-route-info" class="modal-route-info"></div>
        </div>
      ` : ''}
      ${ridersHTML}
      ${actionsHTML}
      ${(ride.originLat && ride.originLng) ? `
        <div class="modal-track-action">
          <button class="btn btn-track btn-full" onclick="window.RideMatch.openTracking('${ride.id}')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
            Track This Trip
          </button>
        </div>
      ` : ''}
    `;

    $('#ride-modal').classList.remove('hidden');

    // Render route map if coordinates available
    if (ride.originLat && ride.originLng) {
      setTimeout(() => renderRouteMap(ride), 150);
    }
  }

  function closeModal() {
    $('#ride-modal').classList.add('hidden');
  }

  // =========================================
  //  RIDE REQUESTS
  // =========================================
  function requestRide(rideId) {
    const requests = loadData(STORAGE_KEYS.requests);

    if (requests.find(r => r.rideId === rideId && r.riderId === currentUser.id)) {
      toast('You already requested this ride', 'error');
      return;
    }

    const rides = loadData(STORAGE_KEYS.rides);
    const ride = rides.find(r => r.id === rideId);
    if (!ride || ride.availableSeats <= 0) {
      toast('No seats available', 'error');
      return;
    }

    // Read companion option from modal if present
    const companionChecked = document.getElementById('bring-companion')?.checked;
    const companionName = companionChecked
      ? (document.getElementById('companion-name')?.value.trim() || '')
      : null;

    if (companionChecked && !companionName) {
      toast('Please enter your companion\'s name', 'error');
      return;
    }
    if (companionChecked && ride.availableSeats < 2) {
      toast('Not enough seats for a companion', 'error');
      return;
    }

    const seatsNeeded = companionChecked ? 2 : 1;

    const request = {
      id: uid(),
      rideId,
      riderId: currentUser.id,
      riderName: currentUser.name,
      riderNeighborhood: currentUser.neighborhood,
      companion: companionChecked ? { name: companionName } : null,
      seatsNeeded,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    requests.push(request);
    saveData(STORAGE_KEYS.requests, requests);

    // Notify the driver
    addNotification(ride.driverId, {
      type: 'request',
      message: `${currentUser.name} from ${currentUser.neighborhood} wants to join your ride on ${formatDate(ride.date)}`,
      rideId,
      timestamp: new Date().toISOString(),
    });

    closeModal();
    toast('Ride request sent! 🙋', 'success');
    renderFindRides();
  }

  function handleRequest(requestId, newStatus) {
    const requests = loadData(STORAGE_KEYS.requests);
    const reqIndex = requests.findIndex(r => r.id === requestId);
    if (reqIndex === -1) return;

    const req = requests[reqIndex];
    req.status = newStatus;

    // Update available seats
    const rides = loadData(STORAGE_KEYS.rides);
    const rideIndex = rides.findIndex(r => r.id === req.rideId);
    if (rideIndex !== -1) {
      if (newStatus === 'accepted') {
        const seats = req.seatsNeeded || 1;
        rides[rideIndex].availableSeats = Math.max(0, rides[rideIndex].availableSeats - seats);
        rides[rideIndex].riders.push(req.riderId);
      }
      saveData(STORAGE_KEYS.rides, rides);
    }

    requests[reqIndex] = req;
    saveData(STORAGE_KEYS.requests, requests);

    // Notify rider
    const ride = rides[rideIndex];
    const statusEmoji = newStatus === 'accepted' ? '✅' : '❌';
    addNotification(req.riderId, {
      type: newStatus,
      message: `${statusEmoji} Your ride request for ${formatDate(ride.date)} (${ride.origin}) has been ${newStatus}`,
      rideId: req.rideId,
      timestamp: new Date().toISOString(),
    });

    toast(`Request ${newStatus}`, newStatus === 'accepted' ? 'success' : 'info');
    openRideModal(req.rideId);
  }

  function cancelRequest(requestId) {
    const requests = loadData(STORAGE_KEYS.requests);
    const idx = requests.findIndex(r => r.id === requestId);
    if (idx === -1) return;

    requests.splice(idx, 1);
    saveData(STORAGE_KEYS.requests, requests);

    toast('Ride request cancelled', 'info');
    renderMyRides();
  }

  function cancelRide(rideId) {
    const rides = loadData(STORAGE_KEYS.rides);
    const rideIndex = rides.findIndex(r => r.id === rideId);
    if (rideIndex === -1) return;

    rides[rideIndex].status = 'cancelled';
    saveData(STORAGE_KEYS.rides, rides);

    // Notify all riders
    const requests = loadData(STORAGE_KEYS.requests);
    const rideRequests = requests.filter(r => r.rideId === rideId && r.status !== 'rejected');
    rideRequests.forEach(req => {
      addNotification(req.riderId, {
        type: 'rejected',
        message: `The ride on ${formatDate(rides[rideIndex].date)} from ${rides[rideIndex].origin} has been cancelled by the driver`,
        rideId,
        timestamp: new Date().toISOString(),
      });
    });

    closeModal();
    toast('Ride cancelled', 'info');
    renderMyRides();
  }

  // =========================================
  //  NOTIFICATIONS
  // =========================================
  function addNotification(userId, notif) {
    const notifications = loadData(STORAGE_KEYS.notifications);
    notifications.unshift({
      id: uid(),
      userId,
      ...notif,
      read: false,
    });
    saveData(STORAGE_KEYS.notifications, notifications);
    updateNotificationBadge();
  }

  function updateNotificationBadge() {
    const notifications = loadData(STORAGE_KEYS.notifications);
    const unread = notifications.filter(n => n.userId === currentUser.id && !n.read).length;
    const badge = $('#notif-badge');
    if (unread > 0) {
      badge.textContent = unread > 9 ? '9+' : unread;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  function renderNotifications() {
    const notifications = loadData(STORAGE_KEYS.notifications);
    const mine = notifications.filter(n => n.userId === currentUser.id);
    const container = $('#notifications-list');

    // Mark all as read
    const allNotifs = loadData(STORAGE_KEYS.notifications);
    allNotifs.forEach(n => {
      if (n.userId === currentUser.id) n.read = true;
    });
    saveData(STORAGE_KEYS.notifications, allNotifs);
    updateNotificationBadge();

    if (mine.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
          <p>No notifications</p>
          <span>You're all caught up!</span>
        </div>
      `;
      return;
    }

    container.innerHTML = mine.map(n => {
      const iconClass = n.type === 'accepted' ? 'accepted' : n.type === 'rejected' ? 'rejected' : 'request';
      const iconSVG = n.type === 'accepted'
        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>'
        : n.type === 'rejected'
          ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
          : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/></svg>';

      return `
        <div class="notification-item ${!n.read ? 'unread' : ''}">
          <div class="notif-icon ${iconClass}">${iconSVG}</div>
          <div class="notif-content">
            <p>${n.message}</p>
            <span>${timeAgo(n.timestamp)}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // =========================================
  //  DASHBOARD
  // =========================================
  function renderDashboard() {
    updateGreeting();
    renderDashboardUpcoming();
    renderDashboardNotifications();
    updateNotificationBadge();
  }

  function renderDashboardUpcoming() {
    const rides = loadData(STORAGE_KEYS.rides);
    const requests = loadData(STORAGE_KEYS.requests);
    const today = new Date().toISOString().split('T')[0];
    const container = $('#dashboard-upcoming');

    // Rides I'm driving
    const myDriving = rides.filter(r =>
      r.driverId === currentUser.id && r.status === 'active' && r.date >= today
    );

    // Rides I'm riding in (accepted requests)
    const myRiding = requests
      .filter(r => r.riderId === currentUser.id && r.status === 'accepted')
      .map(req => {
        const ride = rides.find(r => r.id === req.rideId);
        return ride;
      })
      .filter(r => r && r.status === 'active' && r.date >= today);

    const allUpcoming = [...myDriving, ...myRiding]
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
      .slice(0, 5);

    if (allUpcoming.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
          <p>No upcoming rides</p>
          <span>Offer or find a ride to get started!</span>
        </div>
      `;
      return;
    }

    container.innerHTML = allUpcoming.map(ride => renderRideCard(ride)).join('');
    container.querySelectorAll('.ride-card').forEach(card => {
      card.addEventListener('click', () => openRideModal(card.dataset.rideId));
    });
  }

  function renderDashboardNotifications() {
    const notifications = loadData(STORAGE_KEYS.notifications);
    const mine = notifications.filter(n => n.userId === currentUser.id).slice(0, 3);
    const container = $('#dashboard-notifications');

    if (mine.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
          <p>No notifications</p>
          <span>You're all caught up!</span>
        </div>
      `;
      return;
    }

    container.innerHTML = mine.map(n => {
      const iconClass = n.type === 'accepted' ? 'accepted' : n.type === 'rejected' ? 'rejected' : 'request';
      const iconSVG = n.type === 'accepted'
        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>'
        : n.type === 'rejected'
          ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
          : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/></svg>';

      return `
        <div class="notification-item ${!n.read ? 'unread' : ''}">
          <div class="notif-icon ${iconClass}">${iconSVG}</div>
          <div class="notif-content">
            <p>${n.message}</p>
            <span>${timeAgo(n.timestamp)}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // =========================================
  //  MY RIDES
  // =========================================
  function renderMyRides() {
    renderMyOffers();
    renderMyRequests();
    renderMyHistory();
  }

  function renderMyOffers() {
    const rides = loadData(STORAGE_KEYS.rides);
    const mine = rides.filter(r => r.driverId === currentUser.id && r.status === 'active');
    const container = $('#my-offers-list');

    mine.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

    if (mine.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>You haven't offered any rides yet</p>
          <span>Share your commute with coworkers!</span>
        </div>
      `;
      return;
    }

    container.innerHTML = mine.map(ride => {
      const requests = loadData(STORAGE_KEYS.requests);
      const pendingCount = requests.filter(r => r.rideId === ride.id && r.status === 'pending').length;
      return renderRideCard(ride, pendingCount > 0 ? `${pendingCount} pending` : null);
    }).join('');

    container.querySelectorAll('.ride-card').forEach(card => {
      card.addEventListener('click', () => openRideModal(card.dataset.rideId));
    });
  }

  function renderMyRequests() {
    const requests = loadData(STORAGE_KEYS.requests);
    const rides = loadData(STORAGE_KEYS.rides);
    const mine = requests.filter(r => r.riderId === currentUser.id);
    const container = $('#my-requests-list');

    if (mine.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>No ride requests</p>
          <span>Find and request a ride to see it here.</span>
        </div>
      `;
      return;
    }

    container.innerHTML = mine.map(req => {
      const ride = rides.find(r => r.id === req.rideId);
      if (!ride) return '';

      const dirIcon = ride.direction === 'to-ibm' ? '🏢' : '🏠';
      const dirLabel = ride.direction === 'to-ibm'
        ? `${ride.origin} → IBM`
        : `IBM → ${ride.origin}`;

      const initials = ride.driverName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

      return `
        <div class="ride-card glass-card" data-ride-id="${ride.id}">
          <div class="ride-card-header">
            <div class="ride-card-route">
              <span class="direction-icon">${dirIcon}</span>
              <span>${dirLabel}</span>
            </div>
            <span class="ride-card-badge badge-${req.status}">${req.status}</span>
          </div>
          <div class="ride-card-details">
            <div class="ride-card-detail">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <span>${formatDate(ride.date)}</span>
            </div>
            <div class="ride-card-detail">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span>${formatTime(ride.time)}</span>
            </div>
          </div>
          <div class="ride-card-footer">
            <div class="ride-card-driver">
              <div class="driver-avatar">${initials}</div>
              <span class="driver-name">${ride.driverName}</span>
            </div>
            ${req.status === 'pending' ? `
              <button class="btn btn-ghost btn-sm cancel-req-btn" data-req-id="${req.id}" title="Cancel request"
                style="color:var(--ibm-red);font-size:var(--fs-xs)">Cancel</button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.ride-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('.cancel-req-btn')) return;
        openRideModal(card.dataset.rideId);
      });
    });
    container.querySelectorAll('.cancel-req-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        window.RideMatch.cancelRequest(btn.dataset.reqId);
      });
    });
  }

  function renderMyHistory() {
    const rides = loadData(STORAGE_KEYS.rides);
    const requests = loadData(STORAGE_KEYS.requests);
    const today = new Date().toISOString().split('T')[0];
    const container = $('#my-history-list');

    // Past rides I drove (date passed or cancelled)
    const myPastDriving = rides.filter(r =>
      r.driverId === currentUser.id && (r.date < today || r.status === 'cancelled')
    );

    // Past rides I was accepted as rider
    const myPastRiding = requests
      .filter(r => r.riderId === currentUser.id && r.status === 'accepted')
      .map(req => rides.find(r => r.id === req.rideId))
      .filter(r => r && r.date < today);

    const all = [...myPastDriving, ...myPastRiding]
      .filter((r, i, arr) => arr.findIndex(x => x.id === r.id) === i) // dedupe
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

    if (all.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <p>No ride history yet</p>
          <span>Your past rides will appear here.</span>
        </div>
      `;
      return;
    }

    container.innerHTML = all.map(ride => {
      const dirLabel = ride.fromLabel && ride.toLabel
        ? `${ride.fromLabel} → ${ride.toLabel}`
        : ride.direction === 'to-ibm' ? `${ride.origin} → IBM AFZ` : `IBM AFZ → ${ride.origin}`;
      const dirIcon = ride.direction === 'to-ibm' ? '🏢' : '🏠';
      const initials = ride.driverName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
      const isDriver = ride.driverId === currentUser.id;
      const statusLabel = ride.status === 'cancelled' ? 'Cancelled' : 'Completed';
      const statusClass = ride.status === 'cancelled' ? 'badge-full' : 'badge-seats';
      const driverRating = getDriverRating(ride.driverId);
      const starsHTML = driverRating ? renderStars(driverRating.avg) + ` <span class="rating-avg">${driverRating.avg}</span>` : '';

      // Rate button: only for riders (not driver), completed rides, not yet rated
      const canRate = !isDriver && ride.status !== 'cancelled' && !hasRated(ride.id);
      const rateBtn = canRate
        ? `<button class="btn btn-ghost btn-sm rate-driver-btn"
             onclick="window.RideMatch.openRatingModal('${ride.id}','${ride.driverId}','${ride.driverName}')"
             style="color:var(--ibm-yellow);font-size:var(--fs-xs)">⭐ Rate</button>`
        : (driverRating && !isDriver ? `<span class="rating-done">${renderStars(driverRating.avg)}</span>` : '');

      return `
        <div class="ride-card glass-card history-card">
          <div class="ride-card-header">
            <div class="ride-card-route">
              <span class="direction-icon">${dirIcon}</span>
              <span>${dirLabel}</span>
            </div>
            <span class="ride-card-badge ${statusClass}">${statusLabel}</span>
          </div>
          <div class="ride-card-details">
            <div class="ride-card-detail">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <span>${formatDate(ride.date)}</span>
            </div>
            <div class="ride-card-detail">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span>${formatTime(ride.time)}</span>
            </div>
          </div>
          <div class="ride-card-footer">
            <div class="ride-card-driver">
              <div class="driver-avatar">${initials}</div>
              <div>
                <span class="driver-name">${ride.driverName}${isDriver ? ' (you)' : ''}</span>
                ${starsHTML ? `<span class="driver-rating">${starsHTML}</span>` : ''}
              </div>
            </div>
            ${rateBtn}
          </div>
        </div>
      `;
    }).join('');
  }

  // =========================================
  //  RATINGS
  // =========================================
  function getDriverRating(driverId) {
    const ratings = loadData(STORAGE_KEYS.ratings);
    const mine = ratings.filter(r => r.driverId === driverId);
    if (!mine.length) return null;
    const avg = mine.reduce((s, r) => s + r.stars, 0) / mine.length;
    return { avg: Math.round(avg * 10) / 10, count: mine.length };
  }

  function hasRated(rideId) {
    const ratings = loadData(STORAGE_KEYS.ratings);
    return ratings.some(r => r.rideId === rideId && r.raterId === currentUser.id);
  }

  function renderStars(avg, interactive = false, size = 16) {
    const full = Math.floor(avg);
    const half = avg - full >= 0.5;
    let html = '';
    for (let i = 1; i <= 5; i++) {
      let fill = '#3a3a4e';
      if (i <= full) fill = '#f1c21b';
      else if (i === full + 1 && half) fill = '#f1c21b'; // simplified: show as full for half
      const interactiveAttrs = interactive
        ? `class="star-btn" data-star="${i}" style="cursor:pointer"`
        : '';
      html += `<svg ${interactiveAttrs} width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="${fill === '#3a3a4e' ? '#555' : fill}" stroke-width="1">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>`;
    }
    return html;
  }

  function openRatingModal(rideId, driverId, driverName) {
    let selected = 0;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'rating-overlay';
    overlay.innerHTML = `
      <div class="modal glass-card">
        <button class="modal-close" id="rating-close">&times;</button>
        <div class="modal-ride-header">
          <h2>Rate your driver</h2>
          <span class="direction-tag">⭐ Review</span>
        </div>
        <p style="color:var(--text-muted);font-size:var(--fs-sm);margin-bottom:var(--sp-4)">${driverName}</p>
        <div class="rating-stars-row" id="rating-stars">
          ${[1,2,3,4,5].map(i => `
            <svg class="star-btn" data-star="${i}" width="36" height="36" viewBox="0 0 24 24"
              fill="#3a3a4e" stroke="#555" stroke-width="1" style="cursor:pointer;transition:transform 0.1s">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>`).join('')}
        </div>
        <div class="form-group" style="margin-top:var(--sp-4)">
          <label for="rating-comment">Comment (optional)</label>
          <textarea id="rating-comment" rows="3" placeholder="How was the trip?"></textarea>
        </div>
        <button id="rating-submit" class="btn btn-primary btn-full" disabled>Submit Rating</button>
      </div>
    `;
    document.body.appendChild(overlay);

    // Star interaction
    const stars = overlay.querySelectorAll('.star-btn');
    function highlight(n) {
      stars.forEach((s, idx) => {
        s.setAttribute('fill', idx < n ? '#f1c21b' : '#3a3a4e');
        s.setAttribute('stroke', idx < n ? '#f1c21b' : '#555');
        s.style.transform = idx < n ? 'scale(1.15)' : 'scale(1)';
      });
    }
    stars.forEach(s => {
      s.addEventListener('mouseenter', () => highlight(+s.dataset.star));
      s.addEventListener('mouseleave', () => highlight(selected));
      s.addEventListener('click', () => {
        selected = +s.dataset.star;
        highlight(selected);
        overlay.querySelector('#rating-submit').disabled = false;
      });
    });

    overlay.querySelector('#rating-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#rating-submit').addEventListener('click', () => {
      if (!selected) return;
      const comment = overlay.querySelector('#rating-comment').value.trim();
      const ratings = loadData(STORAGE_KEYS.ratings);
      ratings.push({
        id: uid(), rideId, raterId: currentUser.id,
        driverId, stars: selected, comment,
        createdAt: new Date().toISOString(),
      });
      saveData(STORAGE_KEYS.ratings, ratings);
      overlay.remove();
      toast('Rating submitted. Thanks!', 'success');
      renderMyHistory();
    });
  }

  // =========================================
  //  RIDE CHAT
  // =========================================
  function openChatModal(rideId) {
    const rides = loadData(STORAGE_KEYS.rides);
    const ride = rides.find(r => r.id === rideId);
    if (!ride) return;

    closeModal();
    chatCurrentRideId = rideId;

    const routeLabel = ride.fromLabel && ride.toLabel
      ? `${ride.fromLabel} → ${ride.toLabel}`
      : ride.direction === 'to-ibm' ? `${ride.origin} → IBM AFZ` : `IBM AFZ → ${ride.origin}`;

    $('#chat-title').textContent = '💬 Ride Chat';
    $('#chat-subtitle').textContent = `${formatDate(ride.date)} · ${formatTime(ride.time)} · ${routeLabel}`;

    markChatRead(rideId);
    renderChatMessages(rideId);

    $('#chat-overlay').classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    setTimeout(() => { const inp = $('#chat-input'); if (inp) inp.focus(); }, 200);

    chatPollTimer = setInterval(() => renderChatMessages(rideId), 3000);
  }

  function closeChat() {
    if (chatPollTimer) { clearInterval(chatPollTimer); chatPollTimer = null; }
    chatCurrentRideId = null;
    const overlay = $('#chat-overlay');
    if (overlay) overlay.classList.add('hidden');
    document.body.style.overflow = '';
  }

  function renderChatMessages(rideId) {
    const messages = loadData(STORAGE_KEYS.messages);
    const rideMessages = messages.filter(m => m.rideId === rideId);
    const container = $('#chat-messages');
    if (!container) return;

    const atBottom = container.scrollHeight - container.clientHeight <= container.scrollTop + 10;

    if (rideMessages.length === 0) {
      container.innerHTML = `
        <div class="chat-empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
          <p>No messages yet</p>
          <span>Start the conversation! Share where you'll meet.</span>
        </div>
      `;
      return;
    }

    container.innerHTML = rideMessages.map(msg => {
      const isMine = msg.senderId === currentUser.id;
      const initials = msg.senderName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
      return `
        <div class="chat-msg ${isMine ? 'chat-msg-mine' : 'chat-msg-other'}">
          ${!isMine ? `
            <div class="chat-msg-sender">
              <div class="driver-avatar" style="width:20px;height:20px;font-size:9px">${initials}</div>
              <span>${escapeHtml(msg.senderName.split(' ')[0])}</span>
            </div>
          ` : ''}
          <div class="chat-bubble">${escapeHtml(msg.text)}</div>
          <span class="chat-msg-time">${timeAgo(msg.timestamp)}</span>
        </div>
      `;
    }).join('');

    if (atBottom) container.scrollTop = container.scrollHeight;
  }

  function sendChatMessage() {
    const input = $('#chat-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text || !chatCurrentRideId) return;

    const messages = loadData(STORAGE_KEYS.messages);
    messages.push({
      id: uid(),
      rideId: chatCurrentRideId,
      senderId: currentUser.id,
      senderName: currentUser.name,
      text,
      timestamp: new Date().toISOString(),
    });
    saveData(STORAGE_KEYS.messages, messages);

    input.value = '';
    markChatRead(chatCurrentRideId);
    renderChatMessages(chatCurrentRideId);
  }

  function markChatRead(rideId) {
    const seen = JSON.parse(localStorage.getItem('ridematch_chat_seen') || '{}');
    if (!seen[currentUser.id]) seen[currentUser.id] = {};
    seen[currentUser.id][rideId] = new Date().toISOString();
    localStorage.setItem('ridematch_chat_seen', JSON.stringify(seen));
  }

  function getUnreadChatCount(rideId) {
    const messages = loadData(STORAGE_KEYS.messages);
    const others = messages.filter(m => m.rideId === rideId && m.senderId !== currentUser.id);
    if (!others.length) return 0;
    const seen = JSON.parse(localStorage.getItem('ridematch_chat_seen') || '{}');
    const lastSeen = seen[currentUser.id]?.[rideId];
    if (!lastSeen) return others.length;
    return others.filter(m => m.timestamp > lastSeen).length;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // =========================================
  //  UTILITIES
  // =========================================
  function formatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const options = { weekday: 'short', month: 'short', day: 'numeric' };
    return d.toLocaleDateString('en-US', options);
  }

  function formatTime(timeStr) {
    const [h, m] = timeStr.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h12 = hour % 12 || 12;
    return `${h12}:${m} ${ampm}`;
  }

  function timeAgo(timestamp) {
    const diff = Date.now() - new Date(timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  // =========================================
  //  TOAST NOTIFICATIONS
  // =========================================
  function toast(message, type = 'info') {
    const container = $('#toast-container');
    const toastEl = document.createElement('div');
    toastEl.className = `toast ${type}`;
    const icons = {
      success: '✅',
      error: '⚠️',
      info: 'ℹ️',
    };
    toastEl.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
    container.appendChild(toastEl);

    setTimeout(() => {
      toastEl.classList.add('removing');
      setTimeout(() => toastEl.remove(), 300);
    }, 3500);
  }

  // =========================================
  //  PROFILE
  // =========================================
  function openProfileModal() {
    if (!currentUser) return;
    $('#profile-name').value = currentUser.name;
    $('#profile-email').value = currentUser.email;
    $('#profile-phone').value = currentUser.phone || '';
    $('#profile-neighborhood').value = currentUser.neighborhood || '';
    $('#profile-new-password').value = '';
    $('#profile-confirm-password').value = '';
    $('#profile-modal').classList.remove('hidden');
  }

  function closeProfileModal() {
    $('#profile-modal').classList.add('hidden');
  }

  async function handleProfileSave(e) {
    e.preventDefault();

    const name = $('#profile-name').value.trim();
    const phone = $('#profile-phone').value.trim();
    const neighborhood = $('#profile-neighborhood').value.trim();
    const newPassword = $('#profile-new-password').value;
    const confirmPassword = $('#profile-confirm-password').value;

    if (!name || !neighborhood) {
      toast('Name and neighborhood are required', 'error');
      return;
    }

    if (newPassword) {
      if (newPassword.length < 6) {
        toast('Password must be at least 6 characters', 'error');
        return;
      }
      if (newPassword !== confirmPassword) {
        toast('Passwords do not match', 'error');
        return;
      }
    }

    try {
      // Update password via Firebase Auth if available
      if (newPassword && firebaseAuth) {
        const user = firebaseAuth.currentUser;
        if (user) {
          await user.updatePassword(newPassword);
          toast('Password updated successfully', 'success');
        }
      }

      // Update profile in database
      if (firebaseAuth && firebaseDB) {
        const user = firebaseAuth.currentUser;
        if (user) {
          const userProfile = {
            id: user.uid,
            name,
            email: currentUser.email,
            phone,
            neighborhood,
            createdAt: currentUser.createdAt,
          };

          await firebaseDB.ref(`ridematch/users/${user.uid}`).set(userProfile);
          currentUser = userProfile;
          saveCurrentUser(userProfile);
        }
      } else {
        // Fallback: localStorage mode
        const users = loadData(STORAGE_KEYS.users);
        const idx = users.findIndex(u => u.id === currentUser.id);
        if (idx !== -1) {
          users[idx].name = name;
          users[idx].phone = phone;
          users[idx].neighborhood = neighborhood;
          if (newPassword) users[idx].password = newPassword; // ⚠️ Plain-text in fallback

          saveData(STORAGE_KEYS.users, users);
          currentUser = users[idx];
          saveCurrentUser(currentUser);
        }
      }

      // Update display name in navbar
      $('#nav-user-name').textContent = currentUser.name.split(' ')[0];

      closeProfileModal();
      toast('Profile updated successfully', 'success');

    } catch (err) {
      console.error('Profile update error:', err);
      if (err.code === 'auth/requires-recent-login') {
        toast('Please log out and log in again to change your password', 'error');
      } else {
        toast(`Profile update failed: ${err.message}`, 'error');
      }
    }
  }

  // =========================================
  //  GOOGLE MAPS MODULE
  // =========================================
  function initMapsModule() {
    if (typeof google === 'undefined' || !google.maps) {
      console.warn('Google Maps API not loaded');
      return;
    }
    ['reg-neighborhood', 'filter-search'].forEach(id => {
      initPlacesAutocomplete(document.getElementById(id));
    });
  }

  function initPlacesAutocomplete(input) {
    if (!input || input._autocompleteInit) return;
    input._autocompleteInit = true;
    const ac = new google.maps.places.Autocomplete(input, {
      componentRestrictions: { country: 'cr' },
      fields: ['formatted_address', 'geometry', 'name'],
    });
    ac.addListener('place_changed', () => {
      const place = ac.getPlace();
      if (place && place.geometry) {
        input.dataset.lat = place.geometry.location.lat();
        input.dataset.lng = place.geometry.location.lng();
        input.dataset.address = place.formatted_address || place.name || input.value;
      }
    });
  }

  function renderRouteMap(ride) {
    const mapEl = $('#modal-map');
    if (!mapEl) return;
    const origin = { lat: parseFloat(ride.originLat), lng: parseFloat(ride.originLng) };
    const start = ride.direction === 'to-ibm' ? origin : IBM_LOCATION;
    const end = ride.direction === 'to-ibm' ? IBM_LOCATION : origin;

    const map = new google.maps.Map(mapEl, {
      zoom: 12, center: start, styles: DARK_MAP_STYLES,
      disableDefaultUI: true, zoomControl: true, gestureHandling: 'cooperative',
    });
    const renderer = new google.maps.DirectionsRenderer({
      map, suppressMarkers: false,
      polylineOptions: { strokeColor: '#0f62fe', strokeWeight: 4, strokeOpacity: 0.9 },
    });
    new google.maps.DirectionsService().route({
      origin: start, destination: end, travelMode: google.maps.TravelMode.DRIVING,
    }, (result, status) => {
      if (status === 'OK') {
        renderer.setDirections(result);
        const leg = result.routes[0].legs[0];
        const info = $('#modal-route-info');
        if (info) {
          info.innerHTML = `
            <div class="route-info-item"><span>📏</span><span>${leg.distance.text}</span></div>
            <div class="route-info-item"><span>⏱️</span><span>${leg.duration.text}</span></div>
          `;
        }
      }
    });
  }

  // =========================================
  //  TRIP TRACKING
  // =========================================
  function openTracking(rideId) {
    const rides = loadData(STORAGE_KEYS.rides);
    const ride = rides.find(r => r.id === rideId);
    if (!ride || !ride.originLat || !ride.originLng) {
      toast('Location data not available for this ride', 'error'); return;
    }
    trackingState.currentRide = ride;
    closeModal();
    $('#tracking-overlay').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    $('#tracking-start').classList.remove('hidden');
    $('#tracking-stop').classList.add('hidden');
    $('#tracking-eta').textContent = '--';
    $('#tracking-distance').textContent = '--';
    $('#tracking-speed').textContent = '--';
    $('#tracking-progress-fill').style.width = '0%';
    $('#tracking-progress-text').textContent = '0% complete';
    initTrackingMap(ride);
  }

  function initTrackingMap(ride) {
    const origin = { lat: parseFloat(ride.originLat), lng: parseFloat(ride.originLng) };
    const start = ride.direction === 'to-ibm' ? origin : IBM_LOCATION;
    const end = ride.direction === 'to-ibm' ? IBM_LOCATION : origin;

    trackingState.map = new google.maps.Map($('#tracking-map'), {
      zoom: 13, center: start, styles: DARK_MAP_STYLES,
      disableDefaultUI: true, zoomControl: true,
    });
    // Start marker (green)
    new google.maps.Marker({
      position: start, map: trackingState.map, icon: {
        path: google.maps.SymbolPath.CIRCLE, scale: 10,
        fillColor: '#42be65', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2,
      }, title: 'Start'
    });
    // End marker (red)
    new google.maps.Marker({
      position: end, map: trackingState.map, icon: {
        path: google.maps.SymbolPath.CIRCLE, scale: 10,
        fillColor: '#da1e28', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2,
      }, title: 'Destination'
    });

    trackingState.directionsRenderer = new google.maps.DirectionsRenderer({
      map: trackingState.map, suppressMarkers: true,
      polylineOptions: { strokeColor: '#0f62fe', strokeWeight: 5, strokeOpacity: 0.8 },
    });

    new google.maps.DirectionsService().route({
      origin: start, destination: end, travelMode: google.maps.TravelMode.DRIVING,
    }, (result, status) => {
      if (status === 'OK') {
        trackingState.directionsRenderer.setDirections(result);
        const leg = result.routes[0].legs[0];
        trackingState.totalDistance = leg.distance.value;
        trackingState.totalDuration = leg.duration.value;
        $('#tracking-distance').textContent = leg.distance.text;
        $('#tracking-eta').textContent = leg.duration.text;
        // Decode route for animation
        trackingState.routePoints = result.routes[0].overview_path.map(p => ({ lat: p.lat(), lng: p.lng() }));
      }
    });
  }

  function startTracking() {
    if (trackingState.isTracking) return;
    trackingState.isTracking = true;
    trackingState.currentIndex = 0;
    $('#tracking-start').classList.add('hidden');
    $('#tracking-stop').classList.remove('hidden');

    const startPos = trackingState.routePoints[0] || IBM_LOCATION;
    trackingState.driverMarker = new google.maps.Marker({
      position: startPos, map: trackingState.map, zIndex: 999,
      icon: {
        path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 6,
        fillColor: '#0f62fe', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2,
        rotation: 0,
      }, title: 'Driver',
    });

    if (trackingState.mode === 'demo') { startDemoAnimation(); }
    else { startLiveGPS(); }
  }

  function startDemoAnimation() {
    const pts = trackingState.routePoints;
    if (!pts.length) { toast('Route not available', 'error'); return; }
    const total = pts.length;
    const intervalMs = 80;

    function step() {
      if (!trackingState.isTracking || trackingState.currentIndex >= total - 1) {
        if (trackingState.currentIndex >= total - 1) completeTrip();
        return;
      }
      trackingState.currentIndex++;
      const i = trackingState.currentIndex;
      const pos = pts[i];
      const prev = pts[i - 1];

      // Calculate bearing for arrow rotation
      const heading = google.maps.geometry.spherical.computeHeading(
        new google.maps.LatLng(prev.lat, prev.lng),
        new google.maps.LatLng(pos.lat, pos.lng)
      );
      const icon = trackingState.driverMarker.getIcon();
      icon.rotation = heading;
      trackingState.driverMarker.setIcon(icon);
      trackingState.driverMarker.setPosition(pos);
      trackingState.map.panTo(pos);

      const progress = (i / total) * 100;
      $('#tracking-progress-fill').style.width = progress + '%';
      $('#tracking-progress-text').textContent = Math.round(progress) + '% complete';

      const remFrac = 1 - (i / total);
      const remDist = trackingState.totalDistance * remFrac;
      const remTime = trackingState.totalDuration * remFrac;
      $('#tracking-distance').textContent = remDist > 1000 ? (remDist / 1000).toFixed(1) + ' km left' : Math.round(remDist) + ' m left';
      $('#tracking-eta').textContent = remTime > 60 ? Math.round(remTime / 60) + ' min' : Math.round(remTime) + ' sec';

      const dist = google.maps.geometry.spherical.computeDistanceBetween(
        new google.maps.LatLng(prev.lat, prev.lng), new google.maps.LatLng(pos.lat, pos.lng)
      );
      const speed = Math.min(Math.round((dist / (intervalMs / 1000)) * 3.6), 120);
      $('#tracking-speed').textContent = speed + ' km/h';

      trackingState.animationFrame = setTimeout(step, intervalMs);
    }
    step();
  }

  function startLiveGPS() {
    if (!navigator.geolocation) {
      toast('Geolocation not supported. Switching to demo.', 'error');
      switchToDemo(); return;
    }
    toast('Starting live GPS tracking...', 'info');
    trackingState.watchId = navigator.geolocation.watchPosition(
      (position) => {
        const pos = { lat: position.coords.latitude, lng: position.coords.longitude };
        trackingState.driverMarker.setPosition(pos);
        trackingState.map.panTo(pos);
        if (position.coords.speed != null) {
          $('#tracking-speed').textContent = Math.round(position.coords.speed * 3.6) + ' km/h';
        }
        const ride = trackingState.currentRide;
        const dest = ride.direction === 'to-ibm' ? IBM_LOCATION : { lat: parseFloat(ride.originLat), lng: parseFloat(ride.originLng) };
        const remaining = google.maps.geometry.spherical.computeDistanceBetween(
          new google.maps.LatLng(pos.lat, pos.lng), new google.maps.LatLng(dest.lat, dest.lng)
        );
        $('#tracking-distance').textContent = remaining > 1000 ? (remaining / 1000).toFixed(1) + ' km left' : Math.round(remaining) + ' m left';
        if (position.coords.speed && position.coords.speed > 0) {
          const eta = remaining / position.coords.speed;
          $('#tracking-eta').textContent = eta > 60 ? Math.round(eta / 60) + ' min' : '< 1 min';
        }
        const td = trackingState.totalDistance || 10000;
        const prog = Math.max(0, Math.min(100, ((td - remaining) / td) * 100));
        $('#tracking-progress-fill').style.width = prog + '%';
        $('#tracking-progress-text').textContent = Math.round(prog) + '% complete';
        if (remaining < 100) completeTrip();
      },
      (err) => { toast('GPS error: ' + err.message + '. Switching to demo.', 'error'); switchToDemo(); },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
  }

  function switchToDemo() {
    trackingState.mode = 'demo';
    $('#mode-demo').classList.add('active');
    $('#mode-live').classList.remove('active');
    if (trackingState.watchId) { navigator.geolocation.clearWatch(trackingState.watchId); trackingState.watchId = null; }
    if (trackingState.isTracking) startDemoAnimation();
  }

  function completeTrip() {
    stopTracking();
    $('#tracking-progress-fill').style.width = '100%';
    $('#tracking-progress-text').textContent = '🎉 Trip complete!';
    $('#tracking-distance').textContent = 'Arrived';
    $('#tracking-eta').textContent = '0 min';
    $('#tracking-speed').textContent = '0 km/h';
    toast('You have arrived at your destination! 🎉', 'success');
  }

  function stopTracking() {
    trackingState.isTracking = false;
    if (trackingState.animationFrame) { clearTimeout(trackingState.animationFrame); trackingState.animationFrame = null; }
    if (trackingState.watchId) { navigator.geolocation.clearWatch(trackingState.watchId); trackingState.watchId = null; }
    $('#tracking-start').classList.remove('hidden');
    $('#tracking-stop').classList.add('hidden');
  }

  function closeTracking() {
    stopTracking();
    if (trackingState.driverMarker) { trackingState.driverMarker.setMap(null); trackingState.driverMarker = null; }
    trackingState.map = null;
    trackingState.directionsRenderer = null;
    trackingState.routePoints = [];
    trackingState.currentIndex = 0;
    trackingState.currentRide = null;
    $('#tracking-overlay').classList.add('hidden');
    document.body.style.overflow = '';
  }

  // =========================================
  //  EVENT BINDINGS
  // =========================================
  function bindEvents() {
    // Helper function to safely bind events (check if element exists)
    const safeBind = (selector, event, handler) => {
      const el = $(selector);
      if (el) el.addEventListener(event, handler);
    };

    // Auth
    safeBind('#login-btn', 'click', handleLogin);
    safeBind('#register-btn', 'click', handleRegister);
    safeBind('#show-register', 'click', e => {
      e.preventDefault();
      loginForm.classList.add('hidden');
      registerForm.classList.remove('hidden');
    });
    safeBind('#show-login', 'click', e => {
      e.preventDefault();
      registerForm.classList.add('hidden');
      loginForm.classList.remove('hidden');
    });
    safeBind('#logout-btn', 'click', handleLogout);

    // Enter key for login/register
    safeBind('#login-password', 'keydown', e => { if (e.key === 'Enter') handleLogin(); });
    safeBind('#reg-password', 'keydown', e => { if (e.key === 'Enter') handleRegister(); });

    // Navigation
    $$('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => navigateTo(btn.dataset.page));
    });

    // Quick actions
    safeBind('#quick-offer', 'click', () => navigateTo('offer'));
    safeBind('#quick-find', 'click', () => navigateTo('find'));
    safeBind('#quick-myrides', 'click', () => navigateTo('myrides'));

    // Offer form
    safeBind('#offer-form', 'submit', handleOfferRide);
    safeBind('#offer-swap', 'click', swapOfferLocations);

    // Filters
    safeBind('#filter-direction', 'change', renderFindRides);
    safeBind('#filter-search', 'input', renderFindRides);
    safeBind('#filter-date', 'change', renderFindRides);

    // Modal
    safeBind('#modal-close', 'click', closeModal);
    const rideModal = $('#ride-modal');
    if (rideModal) {
      rideModal.addEventListener('click', e => {
        if (e.target === rideModal) closeModal();
      });
    }

    // Tabs
    $$('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        $$('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        $$('.tab-content').forEach(tc => tc.classList.remove('hidden'));
        const targetTab = $(`#tab-${tabName}`);
        if (targetTab) targetTab.classList.add('active');
      });
    });

    // Keyboard: Escape closes modal
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { closeModal(); closeTracking(); closeProfileModal(); closeChat(); }
    });

    // Chat
    safeBind('#chat-close', 'click', closeChat);
    safeBind('#chat-send', 'click', sendChatMessage);
    safeBind('#chat-input', 'keydown', e => { if (e.key === 'Enter') sendChatMessage(); });

    // Profile
    safeBind('#profile-btn', 'click', openProfileModal);
    safeBind('#profile-modal-close', 'click', closeProfileModal);
    const profileModal = $('#profile-modal');
    if (profileModal) {
      profileModal.addEventListener('click', e => {
        if (e.target === profileModal) closeProfileModal();
      });
    }
    safeBind('#profile-form', 'submit', handleProfileSave);

    // Tracking
    safeBind('#tracking-close', 'click', closeTracking);
    safeBind('#tracking-start', 'click', startTracking);
    safeBind('#tracking-stop', 'click', () => { stopTracking(); toast('Tracking stopped', 'info'); });
    safeBind('#mode-demo', 'click', () => {
      const modeDemo = $('#mode-demo');
      const modeLive = $('#mode-live');
      trackingState.mode = 'demo';
      if (modeDemo) modeDemo.classList.add('active');
      if (modeLive) modeLive.classList.remove('active');
    });
    safeBind('#mode-live', 'click', () => {
      const modeDemo = $('#mode-demo');
      const modeLive = $('#mode-live');
      trackingState.mode = 'live';
      if (modeLive) modeLive.classList.add('active');
      if (modeDemo) modeDemo.classList.remove('active');
    });
  }

  // =========================================
  //  EXPOSE FUNCTIONS FOR INLINE HTML HANDLERS
  // =========================================
  window.RideMatch = {
    requestRide,
    handleRequest,
    cancelRide,
    cancelRequest,
    openTracking,
    openRatingModal,
    openChatModal,
  };

  // =========================================
  //  DEMO SEED DATA
  // =========================================
  function seedDemoData() {
    // DEMO MODE: Force create 28 demo users (clear old ones)
    const existingUsers = loadData(STORAGE_KEYS.users);

    // Check if we already have the 28 demo users
    const hasDemoUsers = existingUsers.some(u => u.email && u.email.includes('user1@test.com'));
    if (hasDemoUsers && existingUsers.length >= 28) return; // already seeded with new users

    // Clear old demo users and create new ones
    console.log('Creating 28 demo users...');

    const today = new Date();
    const fmt = (d) => d.toISOString().split('T')[0];
    const d1 = fmt(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));
    const d2 = fmt(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2));
    const d3 = fmt(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3));

    // Generate 28 demo users
    const users = [];
    const neighborhoods = ['Cartago', 'Heredia', 'San José', 'Alajuela', 'Escazú', 'Santa Ana', 'Curridabat', 'San Pedro'];
    for (let i = 1; i <= 28; i++) {
      users.push({
        id: `u${i}`,
        name: `Demo User ${i}`,
        email: `user${i}@test.com`,
        phone: `+506 ${8800 + i}-${1111 + i}`,
        neighborhood: neighborhoods[(i - 1) % neighborhoods.length],
        password: 'Password123',
        createdAt: new Date().toISOString()
      });
    }

    const rides = [
      {
        id: 'r1', driverId: 'u1', driverName: 'Demo One', driverEmail: 'demo1@ibm.com', driverPhone: '+506 8811-1111',
        direction: 'to-ibm', origin: 'Escazú', originLat: '9.9333', originLng: '-84.1500',
        originAddress: 'Escazú, San José, Costa Rica',
        destination: 'IBM AFZ Building F30, Heredia',
        fromLabel: 'Escazú', toLabel: 'IBM AFZ Building F30',
        date: d1, time: '07:00', totalSeats: 3, availableSeats: 3,
        notes: 'Paso por la rotonda de Multiplaza.', riders: [], status: 'active', createdAt: new Date().toISOString(),
      },
      {
        id: 'r2', driverId: 'u2', driverName: 'Demo Two', driverEmail: 'demo2@ibm.com', driverPhone: '+506 8822-2222',
        direction: 'to-ibm', origin: 'San Pedro', originLat: '9.9350', originLng: '-84.0500',
        originAddress: 'San Pedro, Montes de Oca, San José, Costa Rica',
        destination: 'IBM AFZ Building F30, Heredia',
        fromLabel: 'San Pedro', toLabel: 'IBM AFZ Building F30',
        date: d1, time: '07:30', totalSeats: 2, availableSeats: 2,
        notes: 'Salgo desde el Banco Nacional de San Pedro.', riders: [], status: 'active', createdAt: new Date().toISOString(),
      },
      {
        id: 'r3', driverId: 'u3', driverName: 'Demo Three', driverEmail: 'demo3@ibm.com', driverPhone: '+506 8833-3333',
        direction: 'to-ibm', origin: 'Alajuela', originLat: '10.0162', originLng: '-84.2149',
        originAddress: 'Alajuela, Costa Rica',
        destination: 'IBM AFZ Building F30, Heredia',
        fromLabel: 'Alajuela', toLabel: 'IBM AFZ Building F30',
        date: d2, time: '06:45', totalSeats: 4, availableSeats: 4,
        notes: 'Salgo desde el parque central de Alajuela.', riders: [], status: 'active', createdAt: new Date().toISOString(),
      },
      {
        id: 'r4', driverId: 'u1', driverName: 'Demo One', driverEmail: 'demo1@ibm.com', driverPhone: '+506 8811-1111',
        direction: 'from-ibm', origin: 'Escazú', originLat: '9.9333', originLng: '-84.1500',
        originAddress: 'Escazú, San José, Costa Rica',
        destination: 'Escazú',
        fromLabel: 'IBM AFZ Building F30', toLabel: 'Escazú',
        date: d2, time: '17:30', totalSeats: 3, availableSeats: 3,
        notes: 'Regreso directo a Escazú después del trabajo.', riders: [], status: 'active', createdAt: new Date().toISOString(),
      },
      {
        id: 'r5', driverId: 'u4', driverName: 'Demo Four', driverEmail: 'demo4@ibm.com', driverPhone: '+506 8844-4444',
        direction: 'to-ibm', origin: 'Curridabat', originLat: '9.9167', originLng: '-84.0333',
        originAddress: 'Curridabat, San José, Costa Rica',
        destination: 'IBM AFZ Building F30, Heredia',
        fromLabel: 'Curridabat', toLabel: 'IBM AFZ Building F30',
        date: d3, time: '07:15', totalSeats: 2, availableSeats: 2,
        notes: 'Paso por el redondel de Curridabat.', riders: [], status: 'active', createdAt: new Date().toISOString(),
      },
    ];

    saveData(STORAGE_KEYS.users, users);
    saveData(STORAGE_KEYS.rides, rides);
  }

  // =========================================
  //  KPI / IMPACT DASHBOARD
  // =========================================

  function calculateKPIs() {
    const rides = loadData(STORAGE_KEYS.rides);
    const completedRides = rides.filter(r => r.status === 'completed');

    let totalCarsReduced = 0;
    let totalCO2 = 0;
    let totalCost = 0;
    let totalDistance = 0;

    completedRides.forEach(ride => {
      const passengers = ride.riders ? ride.riders.length : 0;
      // Default distance for demo: Cartago to AFZ Heredia (~38 km)
      const distance = ride.distance || 38;

      totalCarsReduced += passengers; // Each passenger = 1 car avoided
      totalCO2 += distance * passengers * 0.12; // kg CO2 per km per car
      totalCost += distance * passengers * 0.75; // USD per km
      totalDistance += distance;
    });

    const totalTrees = Math.round(totalCO2 / 21); // 21 kg CO2 per tree per year
    const parkingSpaces = Math.min(totalCarsReduced, 100); // Estimate parking impact

    return {
      totalCarsReduced,
      totalCO2: Math.round(totalCO2 * 10) / 10, // Round to 1 decimal
      totalCost: Math.round(totalCost),
      totalTrees,
      parkingSpaces: Math.min(parkingSpaces, totalCarsReduced > 0 ? Math.ceil(totalCarsReduced / 50) + 2 : 0),
      totalRides: completedRides.length
    };
  }

  function animateCounter(elementId, targetValue, suffix = '', duration = 1500) {
    const element = document.getElementById(elementId);
    if (!element) return;

    const startValue = 0;
    const startTime = performance.now();

    function easeOutQuad(t) {
      return t * (2 - t);
    }

    function updateCounter(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutQuad(progress);
      const currentValue = Math.round(startValue + (targetValue - startValue) * easedProgress);

      element.textContent = currentValue + suffix;

      if (progress < 1) {
        requestAnimationFrame(updateCounter);
      }
    }

    requestAnimationFrame(updateCounter);
  }

  function updateKPIDashboard() {
    const kpis = calculateKPIs();

    // Animate counters
    animateCounter('kpi-cars', kpis.totalCarsReduced);
    animateCounter('kpi-co2', kpis.totalCO2, ' kg');
    animateCounter('kpi-cost', kpis.totalCost, ' USD');
    animateCounter('kpi-parking', kpis.parkingSpaces);
    animateCounter('kpi-trees', kpis.totalTrees);

    // Update actual display
    setTimeout(() => {
      $('#kpi-cars').textContent = kpis.totalCarsReduced;
      $('#kpi-co2').textContent = kpis.totalCO2 + ' kg';
      $('#kpi-cost').textContent = '$' + kpis.totalCost.toLocaleString();
      $('#kpi-parking').textContent = kpis.parkingSpaces;
      $('#kpi-trees').textContent = kpis.totalTrees;
    }, 1500);
  }

  // Update KPIs when navigating to impact page
  const originalNavigateTo = navigateTo;
  navigateTo = function(pageName) {
    originalNavigateTo(pageName);
    if (pageName === 'impact') {
      updateKPIDashboard();
    }
  };

  // =========================================
  //  ANIMATED DEMO
  // =========================================

  const DEMO_DATA = {
    route: {
      origin: 'Cartago',
      destination: 'AFZ Heredia',
      distance: 38 // km
    },
    perTrip: {
      carsReduced: 3,
      co2: 13.68, // 38 × 3 × 0.12
      cost: 85.50, // 38 × 3 × 0.75
      parking: 3
    },
    roundTrip: {
      co2: 27.36,
      cost: 171
    },
    annual: {
      trips: 104, // 2/week × 52 weeks
      carsReduced: 312,
      co2: 1420.8,
      cost: 8892,
      trees: 68
    },
    scale100: {
      trips: 7800,
      co2: 35520,
      cost: 222300,
      trees: 1700
    }
  };

  const DEMO_TIMELINE = [
    {
      start: 0,
      duration: 3000,
      scene: 'intro',
      mainText: 'CarPooling Impact Demo',
      subText: 'Real commute: Cartago → AFZ Heredia (38 km)',
      action: 'showRoute'
    },
    {
      start: 3000,
      duration: 4000,
      scene: 'problem',
      mainText: '4 employees, 4 separate cars',
      subText: 'Every day, coworkers drive alone...',
      action: 'show4Cars'
    },
    {
      start: 7000,
      duration: 4000,
      scene: 'solution',
      mainText: 'CarPooling: 4 people, 1 car',
      subText: '3 cars avoided = Massive impact 🚗',
      action: 'mergeTo1Car'
    },
    {
      start: 11000,
      duration: 8000,
      scene: 'trip',
      mainText: 'One Morning Commute',
      subText: 'Watch the savings add up...',
      action: 'animateTrip',
      metrics: DEMO_DATA.perTrip
    },
    {
      start: 19000,
      duration: 6000,
      scene: 'roundTrip',
      mainText: 'Round Trip: Home → Work → Home',
      subText: '2 trips per day doubles the impact',
      action: 'doubleMetrics',
      metrics: DEMO_DATA.roundTrip
    },
    {
      start: 25000,
      duration: 8000,
      scene: 'weekly',
      mainText: 'Twice a Week Throughout 2026',
      subText: '104 carpools = 312 car trips avoided',
      action: 'showAnnual',
      metrics: DEMO_DATA.annual
    },
    {
      start: 33000,
      duration: 10000,
      scene: 'annual',
      mainText: '🎯 2026 Annual Impact',
      subText: '1,421 kg CO2 saved = 68 trees planted! 🌳',
      action: 'showBigNumbers',
      metrics: DEMO_DATA.annual
    },
    {
      start: 43000,
      duration: 8000,
      scene: 'scale',
      mainText: 'Now Imagine 100 Employees...',
      subText: '35.5 tons CO2 saved | $222,300 saved collectively',
      action: 'showScale',
      metrics: DEMO_DATA.scale100
    },
    {
      start: 51000,
      duration: 5000,
      scene: 'cta',
      mainText: 'Small Actions. Massive Impact. 🌍',
      subText: 'Ready to start carpooling?',
      action: 'showCTA'
    }
  ];

  let demoState = {
    isPlaying: false,
    isPaused: false,
    currentTime: 0,
    startTime: null,
    pauseTime: 0,
    animationFrame: null
  };

  // Open demo modal
  window.openDemoAnimation = function() {
    const modal = $('#demo-animation-modal');
    if (modal) {
      modal.classList.remove('hidden');
      resetDemo();
      initDemoMap();
    }
  };

  // Bind launch button
  function bindDemoButton() {
    const launchBtn = $('#launch-demo-btn');
    if (launchBtn) {
      launchBtn.addEventListener('click', openDemoAnimation);
    }
  }

  // Init demo map (simplified - no actual Google Maps for speed)
  function initDemoMap() {
    const mapCanvas = $('#demo-map');
    if (!mapCanvas) return;

    // Clear previous content
    mapCanvas.innerHTML = '';

    // Add decorative elements (simple visual representation)
    const visualRoute = document.createElement('div');
    visualRoute.style.cssText = `
      position: absolute;
      width: 60%;
      height: 3px;
      background: linear-gradient(90deg, rgba(15, 98, 254, 0.3) 0%, rgba(8, 189, 186, 0.3) 100%);
      top: 50%;
      left: 20%;
      transform: translateY(-50%);
    `;
    mapCanvas.appendChild(visualRoute);

    // Add location markers
    const originMarker = document.createElement('div');
    originMarker.innerHTML = '📍';
    originMarker.style.cssText = `
      position: absolute;
      font-size: 2rem;
      left: 15%;
      top: 50%;
      transform: translate(-50%, -50%);
    `;
    mapCanvas.appendChild(originMarker);

    const destMarker = document.createElement('div');
    destMarker.innerHTML = '📍';
    destMarker.style.cssText = `
      position: absolute;
      font-size: 2rem;
      right: 15%;
      top: 50%;
      transform: translate(50%, -50%);
    `;
    mapCanvas.appendChild(destMarker);

    // Add car element
    const car = document.createElement('div');
    car.id = 'demo-animated-car';
    car.innerHTML = '🚗';
    car.className = 'demo-car';
    car.style.cssText = `
      left: 15%;
      top: 50%;
      transform: translate(-50%, -50%);
      opacity: 0;
    `;
    mapCanvas.appendChild(car);
  }

  // Reset demo
  function resetDemo() {
    demoState = {
      isPlaying: false,
      isPaused: false,
      currentTime: 0,
      startTime: null,
      pauseTime: 0,
      animationFrame: null
    };

    // Reset UI
    updateDemoText('CarPooling Impact Demo', 'Click Start to begin');
    updateDemoMetrics(0, 0, 0, 0, 0);
    updateProgressBar(0);
    updatePlayButton(false);
  }

  // Update narrative text
  function updateDemoText(main, sub) {
    const mainEl = $('#demo-text-main');
    const subEl = $('#demo-text-sub');
    if (mainEl) mainEl.textContent = main;
    if (subEl) subEl.textContent = sub;
  }

  // Update metrics
  function updateDemoMetrics(distance, cars, co2, cost, parking) {
    $('#demo-distance').textContent = distance + ' km';
    $('#demo-cars').textContent = cars;
    $('#demo-co2').textContent = co2 + ' kg';
    $('#demo-cost').textContent = '$' + cost;
    $('#demo-parking').textContent = parking;
  }

  // Update progress bar
  function updateProgressBar(percent) {
    const fill = $('#demo-progress-fill');
    if (fill) fill.style.width = percent + '%';
  }

  // Update play button state
  function updatePlayButton(isPlaying) {
    const icon = $('#demo-play-icon');
    const text = $('#demo-play-text');
    if (icon) icon.textContent = isPlaying ? '⏸' : '▶';
    if (text) text.textContent = isPlaying ? 'Pause' : 'Resume';
  }

  // Main animation loop
  function runDemoAnimation(timestamp) {
    if (!demoState.isPlaying) return;

    if (!demoState.startTime) {
      demoState.startTime = timestamp - demoState.pauseTime;
    }

    demoState.currentTime = timestamp - demoState.startTime;

    // Find current scene
    const scene = DEMO_TIMELINE.find(s =>
      demoState.currentTime >= s.start &&
      demoState.currentTime < s.start + s.duration
    );

    if (scene) {
      updateScene(scene, demoState.currentTime - scene.start);
    }

    // Update progress
    const totalDuration = 56000; // ~56 seconds
    const progress = Math.min((demoState.currentTime / totalDuration) * 100, 100);
    updateProgressBar(progress);

    // Check if finished
    if (demoState.currentTime >= totalDuration) {
      endDemo();
      return;
    }

    demoState.animationFrame = requestAnimationFrame(runDemoAnimation);
  }

  // Update scene
  function updateScene(scene, elapsed) {
    const progress = elapsed / scene.duration;

    // Update text if scene changed
    if (!scene.textUpdated) {
      updateDemoText(scene.mainText, scene.subText);
      scene.textUpdated = true;
    }

    // Scene-specific actions
    if (scene.action === 'animateTrip' && scene.metrics) {
      const currentDistance = Math.round(38 * progress);
      const currentCars = Math.min(Math.round(scene.metrics.carsReduced * progress), scene.metrics.carsReduced);
      const currentCO2 = (scene.metrics.co2 * progress).toFixed(2);
      const currentCost = (scene.metrics.cost * progress).toFixed(2);

      updateDemoMetrics(currentDistance, currentCars, currentCO2, currentCost, scene.metrics.parking);

      // Move car
      const car = $('#demo-animated-car');
      if (car) {
        const leftPos = 15 + (65 * progress);
        car.style.left = leftPos + '%';
        car.style.opacity = '1';
      }
    } else if (scene.action === 'showBigNumbers' && scene.metrics) {
      updateDemoMetrics(
        38,
        scene.metrics.carsReduced,
        Math.round(scene.metrics.co2),
        Math.round(scene.metrics.cost),
        scene.metrics.carsReduced > 0 ? Math.ceil(scene.metrics.carsReduced / 50) : 0
      );
    } else if (scene.action === 'showScale' && scene.metrics) {
      updateDemoMetrics(
        38,
        scene.metrics.trips,
        Math.round(scene.metrics.co2),
        Math.round(scene.metrics.cost),
        75
      );
    }
  }

  // End demo
  function endDemo() {
    demoState.isPlaying = false;
    updatePlayButton(false);
    updateProgressBar(100);
    updateDemoText('Demo Complete! 🎉', 'Ready to make an impact?');
  }

  // Control handlers
  function handlePlayPause() {
    if (!demoState.isPlaying) {
      // Start or resume
      demoState.isPlaying = true;
      demoState.isPaused = false;
      updatePlayButton(true);
      demoState.animationFrame = requestAnimationFrame(runDemoAnimation);
    } else {
      // Pause
      demoState.isPlaying = false;
      demoState.isPaused = true;
      demoState.pauseTime = demoState.currentTime;
      demoState.startTime = null;
      updatePlayButton(false);
      if (demoState.animationFrame) {
        cancelAnimationFrame(demoState.animationFrame);
      }
    }
  }

  function handleDemoRestart() {
    if (demoState.animationFrame) {
      cancelAnimationFrame(demoState.animationFrame);
    }
    resetDemo();
    initDemoMap();
  }

  function handleDemoClose() {
    if (demoState.animationFrame) {
      cancelAnimationFrame(demoState.animationFrame);
    }
    const modal = $('#demo-animation-modal');
    if (modal) {
      modal.classList.add('hidden');
    }
    resetDemo();
  }

  // Bind demo controls
  function bindDemoControls() {
    $('#demo-play-pause')?.addEventListener('click', handlePlayPause);
    $('#demo-restart')?.addEventListener('click', handleDemoRestart);
    $('#demo-close')?.addEventListener('click', handleDemoClose);
  }

  // =========================================
  //  BOOT
  // =========================================
  document.addEventListener('DOMContentLoaded', async () => {
    await initFirebaseSync(); // pull shared data before seeding/rendering
    seedDemoData();
    init();
    bindDemoButton();
    bindDemoControls();
  });
})();
