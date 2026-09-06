(function () {
  const D = window.MOCK_DATA;
  const arrivals = D.arrivals.map((r) => ({ ...r }));
  const inHouse = D.inHouse.map((r) => ({ ...r }));
  const departures = D.departures.map((r) => ({ ...r }));
  const availableRooms = ["101", "103", "210", "305", "410", "512"];

  function toast(msg) {
    let t = document.getElementById("toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "toast";
      t.style.cssText =
        "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--surface);" +
        "border:1px solid var(--border);padding:10px 18px;border-radius:999px;font-size:13px;" +
        "box-shadow:var(--shadow);z-index:60;color:var(--text)";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = "1";
    clearTimeout(t._timer);
    t._timer = setTimeout(() => (t.style.opacity = "0"), 2200);
  }

  function renderCounts() {
    document.getElementById("count-arrivals").textContent = arrivals.length;
    document.getElementById("count-inhouse").textContent = inHouse.length;
    document.getElementById("count-departures").textContent = departures.length;
  }

  function renderArrivals() {
    const col = document.getElementById("col-arrivals");
    col.innerHTML = "";
    if (!arrivals.length) {
      col.innerHTML = `<div class="empty-col">No arrivals remaining.</div>`;
      return;
    }
    arrivals.forEach((r) => {
      const card = document.createElement("div");
      card.className = "gcard";
      card.style.setProperty("--stripe", "var(--col-arrivals)");
      card.innerHTML = `
        <div class="gcard-body">
          <div class="drag">⠿⠿ drag</div>
          <div class="ref">${r.reference}</div>
          <div class="name">${r.guest}</div>
          <div class="meta">${window.fmtDate(r.arrival)} → ${window.fmtDate(r.departure)}${r.notes ? " · " + r.notes : ""}</div>
          <div class="status-line ${r.unassignedRooms > 0 ? "status-flag" : "status-ok"}">
            ${r.unassignedRooms > 0 ? `${r.unassignedRooms} room(s) unassigned` : `Room ${r.assignedRoom} assigned`}
          </div>
        </div>
        <div class="gcard-footer"></div>
      `;
      const footer = card.querySelector(".gcard-footer");
      if (r.unassignedRooms > 0) {
        const assignBtn = document.createElement("button");
        assignBtn.className = "btn small";
        assignBtn.textContent = "Assign room";
        assignBtn.addEventListener("click", () => openAssignDrawer(r));
        footer.appendChild(assignBtn);
      }
      const checkInBtn = document.createElement("button");
      checkInBtn.className = "btn small";
      checkInBtn.textContent = "Check in";
      checkInBtn.disabled = r.unassignedRooms > 0;
      checkInBtn.addEventListener("click", () => {
        toast(`${r.reference} checked in`);
        arrivals.splice(arrivals.indexOf(r), 1);
        renderArrivals();
        renderCounts();
      });
      footer.appendChild(checkInBtn);
      col.appendChild(card);
    });
  }

  function renderGuestColumn(colId, rows, list) {
    const col = document.getElementById(colId);
    col.innerHTML = "";
    if (!rows.length) {
      col.innerHTML = `<div class="empty-col">Nothing here.</div>`;
      return;
    }
    rows.forEach((r) => {
      const owes = r.balanceMinor !== 0;
      const card = document.createElement("div");
      card.className = "gcard";
      card.style.setProperty(
        "--stripe",
        colId === "col-inhouse" ? "var(--col-inhouse)" : "var(--col-departures)",
      );
      card.innerHTML = `
        <div class="gcard-body">
          <div class="ref">${r.reference} · Room ${r.room}</div>
          <div class="name">${r.guest}</div>
          <div class="meta">Departs ${window.fmtDate(r.departure)}</div>
          <div class="status-line ${owes ? "status-owed" : "status-ok"}">
            ${window.formatMoney(r.balanceMinor, r.currency)}${owes ? " owed" : " settled"}
          </div>
        </div>
        <div class="gcard-footer"></div>
      `;
      const btn = document.createElement("button");
      btn.className = "btn small";
      btn.textContent = owes ? "Check out anyway" : "Check out";
      btn.addEventListener("click", () => {
        toast(`${r.reference} checked out`);
        [inHouse, departures].forEach((arr) => {
          const idx = arr.indexOf(r);
          if (idx > -1) arr.splice(idx, 1);
        });
        renderGuestColumn("col-inhouse", inHouse);
        renderGuestColumn("col-departures", departures);
        renderCounts();
      });
      card.querySelector(".gcard-footer").appendChild(btn);
      col.appendChild(card);
    });
  }

  // -- drawers --
  const overlay = document.getElementById("overlay");
  const assignDrawer = document.getElementById("drawer-assign");
  const walkinDrawer = document.getElementById("drawer-walkin");
  let assignTarget = null;
  let assignSelected = null;

  function openDrawer(drawer) {
    overlay.classList.add("open");
    drawer.classList.add("open");
  }
  function closeDrawers() {
    overlay.classList.remove("open");
    assignDrawer.classList.remove("open");
    walkinDrawer.classList.remove("open");
  }
  overlay.addEventListener("click", closeDrawers);
  document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeDrawers));

  function openAssignDrawer(reservation) {
    assignTarget = reservation;
    assignSelected = null;
    document.getElementById("assign-summary").textContent =
      `${reservation.guest} · ${reservation.reference} needs ${reservation.unassignedRooms} room(s) assigned.`;
    const list = document.getElementById("room-pick-list");
    list.innerHTML = "";
    availableRooms.forEach((room) => {
      const el = document.createElement("div");
      el.className = "room-pick";
      el.textContent = room;
      el.addEventListener("click", () => {
        assignSelected = room;
        list.querySelectorAll(".room-pick").forEach((n) => n.classList.remove("selected"));
        el.classList.add("selected");
        document.getElementById("assign-confirm").disabled = false;
      });
      list.appendChild(el);
    });
    document.getElementById("assign-confirm").disabled = true;
    openDrawer(assignDrawer);
  }

  document.getElementById("assign-confirm").addEventListener("click", () => {
    if (!assignTarget || !assignSelected) return;
    assignTarget.unassignedRooms = 0;
    assignTarget.assignedRoom = assignSelected;
    toast(`Room ${assignSelected} assigned to ${assignTarget.reference}`);
    closeDrawers();
    renderArrivals();
  });

  document.getElementById("open-walkin").addEventListener("click", () => {
    renderWalkinOffers();
    openDrawer(walkinDrawer);
  });

  let wiPick = null;
  function renderWalkinOffers() {
    const wrap = document.getElementById("wi-offers");
    wrap.innerHTML = "";
    D.roomTypes.forEach((rt) => {
      const card = document.createElement("div");
      card.className = "offer-card";
      card.innerHTML = `
        <div class="rt-name">${rt.name}</div>
        <div class="rt-avail">${rt.unitsAvailable} available</div>
      `;
      rt.ratePlans.forEach((rp) => {
        const selected = wiPick && wiPick.roomTypeId === rt.id && wiPick.ratePlanId === rp.id;
        const row = document.createElement("div");
        row.className = "rate-row" + (rp.sellable ? "" : " disabled");
        row.innerHTML = `<span>${rp.name}</span><span class="rp-price">${window.formatMoney(rp.totalMinor, rp.currency)}</span>`;
        const pickBtn = document.createElement("button");
        pickBtn.className = "btn small" + (selected ? "" : " ghost");
        pickBtn.textContent = selected ? "✓" : "Pick";
        pickBtn.disabled = !rp.sellable || rt.unitsAvailable < 1;
        pickBtn.addEventListener("click", () => {
          wiPick = { roomTypeId: rt.id, ratePlanId: rp.id };
          renderWalkinOffers();
        });
        row.appendChild(pickBtn);
        card.appendChild(row);
      });
      wrap.appendChild(card);
    });
  }

  document.getElementById("wi-submit").addEventListener("click", () => {
    if (!wiPick) return toast("Choose a room first");
    const first = document.getElementById("wi-first").value.trim();
    const last = document.getElementById("wi-last").value.trim();
    if (!first || !last) return toast("Guest name required");
    toast(`Walk-in created for ${first} ${last} & checked in`);
    document.getElementById("wi-first").value = "";
    document.getElementById("wi-last").value = "";
    wiPick = null;
    closeDrawers();
  });

  renderCounts();
  renderArrivals();
  renderGuestColumn("col-inhouse", inHouse);
  renderGuestColumn("col-departures", departures);
})();
