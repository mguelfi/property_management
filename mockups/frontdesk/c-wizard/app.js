(function () {
  const D = window.MOCK_DATA;
  const arrivals = D.arrivals.map((r) => ({ ...r }));
  const inHouse = D.inHouse.map((r) => ({ ...r }));
  const availableRooms = ["101", "103", "210", "305", "410", "512"];

  function toast(msg) {
    let t = document.getElementById("toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "toast";
      t.style.cssText =
        "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--surface);" +
        "border:1px solid var(--border);padding:11px 20px;border-radius:10px;font-size:13.5px;" +
        "box-shadow:var(--shadow);z-index:60;color:var(--text);font-family:-apple-system,sans-serif";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = "1";
    clearTimeout(t._timer);
    t._timer = setTimeout(() => (t.style.opacity = "0"), 2400);
  }

  function showScreen(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    document.getElementById(id).classList.add("active");
  }

  function renderGlance() {
    const wrap = document.getElementById("glance");
    const unassigned = arrivals.reduce((n, r) => n + r.unassignedRooms, 0);
    wrap.innerHTML = `
      <div><div class="g-num">${arrivals.length}</div><div class="g-lbl">Arrivals</div></div>
      <div><div class="g-num">${inHouse.length}</div><div class="g-lbl">In-house</div></div>
      <div><div class="g-num">${D.departures.length}</div><div class="g-lbl">Departing today</div></div>
      <div><div class="g-num">${unassigned}</div><div class="g-lbl">Unassigned rooms</div></div>
    `;
  }

  document.querySelectorAll("[data-open]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const flow = btn.dataset.open;
      if (flow === "checkin") startCheckin();
      if (flow === "checkout") startCheckout();
      if (flow === "walkin") startWalkin();
    });
  });
  document.querySelectorAll("[data-back]").forEach((btn) =>
    btn.addEventListener("click", () => {
      renderGlance();
      showScreen("screen-landing");
    }),
  );

  function renderStepper(containerId, labels, activeIndex) {
    const el = document.getElementById(containerId);
    el.innerHTML = "";
    labels.forEach((label, i) => {
      const wrap = document.createElement("div");
      wrap.className =
        "step-dot-wrap " + (i === activeIndex ? "active" : i < activeIndex ? "done" : "");
      wrap.innerHTML = `<span class="step-dot">${i < activeIndex ? "✓" : i + 1}</span><span class="step-lbl">${label}</span>`;
      el.appendChild(wrap);
      if (i < labels.length - 1) {
        const sep = document.createElement("div");
        sep.className = "step-sep";
        el.appendChild(sep);
      }
    });
  }

  // ---------- Check-in flow ----------
  function startCheckin() {
    const state = { arrival: null, room: null, neededAssignment: false, roomConfirmed: false };

    function steps() {
      const s = ["Select arrival"];
      if (state.neededAssignment) s.push("Assign room");
      s.push("Confirm");
      return s;
    }

    function render() {
      const s = steps();
      let current = 0;
      if (state.arrival) {
        current = state.neededAssignment && !state.roomConfirmed ? 1 : s.length - 1;
      }
      renderStepper("checkin-stepper", s, current);
      const body = document.getElementById("checkin-body");

      if (current === 0) {
        body.innerHTML = `<h2>Which reservation is checking in?</h2><div class="rcard-list" id="rc-list"></div>`;
        const list = document.getElementById("rc-list");
        arrivals.forEach((r) => {
          const card = document.createElement("div");
          card.className = "rcard";
          card.innerHTML = `
            <span class="rc-radio"></span>
            <span class="rc-main">
              <div class="rc-title">${r.guest} · ${r.reference}</div>
              <div class="rc-sub">${window.fmtDate(r.arrival)} → ${window.fmtDate(r.departure)}${r.notes ? " · " + r.notes : ""}</div>
            </span>
            ${r.unassignedRooms > 0 ? `<span class="rc-flag">${r.unassignedRooms} unassigned</span>` : `<span class="rc-sub">Room ${r.assignedRoom}</span>`}
          `;
          card.addEventListener("click", () => {
            state.arrival = r;
            state.room = null;
            state.roomConfirmed = false;
            state.neededAssignment = r.unassignedRooms > 0;
            render();
          });
          list.appendChild(card);
        });
        return;
      }

      if (s[current] === "Assign room") {
        body.innerHTML = `<h2>Assign a room to ${state.arrival.guest}</h2><div class="rcard-list" id="rc-rooms"></div>
          <div class="step-actions">
            <button class="btn-text" id="ci-back">Back</button>
            <button class="btn" id="ci-next" disabled>Continue</button>
          </div>`;
        const list = document.getElementById("rc-rooms");
        availableRooms.forEach((room) => {
          const card = document.createElement("div");
          card.className = "rcard" + (state.room === room ? " selected" : "");
          card.innerHTML = `<span class="rc-radio"></span><span class="rc-main"><div class="rc-title">Room ${room}</div></span>`;
          card.addEventListener("click", () => {
            state.room = room;
            render();
          });
          list.appendChild(card);
        });
        document.getElementById("ci-next").disabled = !state.room;
        document.getElementById("ci-back").addEventListener("click", () => {
          state.arrival = null;
          render();
        });
        document.getElementById("ci-next").addEventListener("click", () => {
          state.arrival.unassignedRooms = 0;
          state.arrival.assignedRoom = state.room;
          state.roomConfirmed = true;
          render();
        });
        return;
      }

      // confirm
      body.innerHTML = `
        <h2>Confirm check-in</h2>
        <div class="summary">
          <div class="row"><span class="lbl">Guest</span><span class="val">${state.arrival.guest}</span></div>
          <div class="row"><span class="lbl">Reference</span><span class="val">${state.arrival.reference}</span></div>
          <div class="row"><span class="lbl">Room</span><span class="val">${state.arrival.assignedRoom}</span></div>
          <div class="row"><span class="lbl">Stay</span><span class="val">${window.fmtDate(state.arrival.arrival)} → ${window.fmtDate(state.arrival.departure)}</span></div>
        </div>
        <div class="step-actions">
          <button class="btn-text" id="ci-back2">Back</button>
          <button class="btn" id="ci-confirm">Check in</button>
        </div>
      `;
      document.getElementById("ci-back2").addEventListener("click", () => {
        if (state.neededAssignment) {
          state.roomConfirmed = false;
        } else {
          state.arrival = null;
        }
        render();
      });
      document.getElementById("ci-confirm").addEventListener("click", () => {
        toast(`${state.arrival.reference} checked in`);
        arrivals.splice(arrivals.indexOf(state.arrival), 1);
        state.arrival = null;
        state.room = null;
        renderGlance();
        showScreen("screen-landing");
      });
    }

    render();
    showScreen("screen-checkin");
  }

  // ---------- Check-out flow ----------
  function startCheckout() {
    const state = { guest: null };
    const labels = ["Select guest", "Confirm"];

    function render() {
      const current = state.guest ? 1 : 0;
      renderStepper("checkout-stepper", labels, current);
      const body = document.getElementById("checkout-body");

      if (current === 0) {
        body.innerHTML = `<h2>Who's checking out?</h2><div class="rcard-list" id="co-list"></div>`;
        const list = document.getElementById("co-list");
        inHouse.forEach((r) => {
          const owes = r.balanceMinor !== 0;
          const card = document.createElement("div");
          card.className = "rcard";
          card.innerHTML = `
            <span class="rc-radio"></span>
            <span class="rc-main">
              <div class="rc-title">${r.guest} · Room ${r.room}</div>
              <div class="rc-sub">Departs ${window.fmtDate(r.departure)}</div>
            </span>
            <span class="${owes ? "rc-flag" : "rc-sub"}">${window.formatMoney(r.balanceMinor, r.currency)}</span>
          `;
          card.addEventListener("click", () => {
            state.guest = r;
            render();
          });
          list.appendChild(card);
        });
        return;
      }

      const owes = state.guest.balanceMinor !== 0;
      body.innerHTML = `
        <h2>Confirm check-out</h2>
        ${owes ? `<div class="warn-note">This folio has an outstanding balance. Checking out will leave it unsettled.</div>` : ""}
        <div class="summary">
          <div class="row"><span class="lbl">Guest</span><span class="val">${state.guest.guest}</span></div>
          <div class="row"><span class="lbl">Room</span><span class="val">${state.guest.room}</span></div>
          <div class="row"><span class="lbl">Balance</span><span class="val ${owes ? "owed" : "ok"}">${window.formatMoney(state.guest.balanceMinor, state.guest.currency)}</span></div>
        </div>
        <div class="step-actions">
          <button class="btn-text" id="co-back">Back</button>
          <button class="btn" id="co-confirm">${owes ? "Check out anyway" : "Check out"}</button>
        </div>
      `;
      document.getElementById("co-back").addEventListener("click", () => {
        state.guest = null;
        render();
      });
      document.getElementById("co-confirm").addEventListener("click", () => {
        toast(`${state.guest.reference} checked out`);
        inHouse.splice(inHouse.indexOf(state.guest), 1);
        state.guest = null;
        renderGlance();
        showScreen("screen-landing");
      });
    }

    render();
    showScreen("screen-checkout");
  }

  // ---------- Walk-in flow ----------
  function startWalkin() {
    const state = {
      departure: "2026-09-07",
      adults: 2,
      roomTypeId: null,
      ratePlanId: null,
      first: "",
      last: "",
      step: 0,
    };
    const labels = ["Stay details", "Choose a room", "Guest details"];

    function pickedRatePlan() {
      if (!state.roomTypeId) return null;
      const rt = D.roomTypes.find((r) => r.id === state.roomTypeId);
      return rt.ratePlans.find((rp) => rp.id === state.ratePlanId);
    }

    function render() {
      renderStepper("walkin-stepper", labels, state.step);
      const body = document.getElementById("walkin-body");

      if (state.step === 0) {
        body.innerHTML = `
          <h2>Stay details</h2>
          <div class="form-row">
            <div class="field">
              <label class="field-label" for="wi-arrival">Arrival</label>
              <input class="input" id="wi-arrival" value="2026-09-06" disabled />
            </div>
            <div class="field">
              <label class="field-label" for="wi-departure">Departure</label>
              <input class="input" type="date" id="wi-departure" value="${state.departure}" />
            </div>
          </div>
          <div class="field" style="max-width:160px">
            <label class="field-label" for="wi-adults">Adults</label>
            <input class="input" type="number" min="1" id="wi-adults" value="${state.adults}" />
          </div>
          <div class="step-actions">
            <span></span>
            <button class="btn" id="wi-next0">Continue</button>
          </div>
        `;
        document.getElementById("wi-next0").addEventListener("click", () => {
          state.departure = document.getElementById("wi-departure").value;
          state.adults = Number(document.getElementById("wi-adults").value) || 1;
          state.step = 1;
          render();
        });
        return;
      }

      if (state.step === 1) {
        body.innerHTML = `<h2>Choose a room</h2><div class="rcard-list" id="wi-rooms"></div>
          <div class="step-actions">
            <button class="btn-text" id="wi-back1">Back</button>
            <button class="btn" id="wi-next1" disabled>Continue</button>
          </div>`;
        const list = document.getElementById("wi-rooms");
        D.roomTypes.forEach((rt) => {
          rt.ratePlans.forEach((rp) => {
            const disabled = !rp.sellable || rt.unitsAvailable < 1;
            const selected = state.roomTypeId === rt.id && state.ratePlanId === rp.id;
            const card = document.createElement("div");
            card.className = "rcard" + (selected ? " selected" : "") + (disabled ? " disabled" : "");
            card.innerHTML = `
              <span class="rc-radio"></span>
              <span class="rc-main">
                <div class="rc-title">${rt.name} — ${rp.name}</div>
                <div class="rc-sub">${rt.unitsAvailable} available · ${window.formatMoney(rp.totalMinor, rp.currency)}</div>
              </span>
              ${disabled ? `<span class="rc-flag">Sold out</span>` : ""}
            `;
            if (!disabled) {
              card.addEventListener("click", () => {
                state.roomTypeId = rt.id;
                state.ratePlanId = rp.id;
                render();
              });
            }
            list.appendChild(card);
          });
        });
        document.getElementById("wi-next1").disabled = !state.ratePlanId;
        document.getElementById("wi-back1").addEventListener("click", () => {
          state.step = 0;
          render();
        });
        document.getElementById("wi-next1").addEventListener("click", () => {
          state.step = 2;
          render();
        });
        return;
      }

      // step 2: guest details + review
      const rt = D.roomTypes.find((r) => r.id === state.roomTypeId);
      const rp = pickedRatePlan();
      body.innerHTML = `
        <h2>Guest details</h2>
        <div class="form-row">
          <div class="field">
            <label class="field-label" for="wi-first">First name</label>
            <input class="input" id="wi-first" placeholder="Jordan" value="${state.first}" />
          </div>
          <div class="field">
            <label class="field-label" for="wi-last">Last name</label>
            <input class="input" id="wi-last" placeholder="Rivera" value="${state.last}" />
          </div>
        </div>
        <div class="summary">
          <div class="row"><span class="lbl">Stay</span><span class="val">2026-09-06 → ${state.departure}</span></div>
          <div class="row"><span class="lbl">Adults</span><span class="val">${state.adults}</span></div>
          <div class="row"><span class="lbl">Room</span><span class="val">${rt.name} (${rp.name})</span></div>
          <div class="row"><span class="lbl">Total</span><span class="val">${window.formatMoney(rp.totalMinor, rp.currency)}</span></div>
        </div>
        <div class="step-actions">
          <button class="btn-text" id="wi-back2">Back</button>
          <button class="btn" id="wi-submit">Create walk-in &amp; check in</button>
        </div>
      `;
      document.getElementById("wi-back2").addEventListener("click", () => {
        state.first = document.getElementById("wi-first").value;
        state.last = document.getElementById("wi-last").value;
        state.step = 1;
        render();
      });
      document.getElementById("wi-submit").addEventListener("click", () => {
        const first = document.getElementById("wi-first").value.trim();
        const last = document.getElementById("wi-last").value.trim();
        if (!first || !last) return toast("Guest name required");
        toast(`Walk-in created for ${first} ${last} & checked in`);
        showScreen("screen-landing");
        renderGlance();
      });
    }

    render();
    showScreen("screen-walkin");
  }

  renderGlance();
})();
