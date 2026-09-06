(function () {
  const D = window.MOCK_DATA;
  const arrivals = D.arrivals.map((r) => ({ ...r }));
  const inHouse = D.inHouse.map((r) => ({ ...r }));

  function toast(msg) {
    let t = document.getElementById("toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "toast";
      t.style.cssText =
        "position:fixed;bottom:20px;right:20px;background:var(--surface-2);border:1px solid var(--border);" +
        "padding:10px 16px;border-radius:8px;font-size:13px;box-shadow:var(--shadow);z-index:50;color:var(--text)";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = "1";
    clearTimeout(t._timer);
    t._timer = setTimeout(() => (t.style.opacity = "0"), 2200);
  }

  // -- tabs --
  document.querySelectorAll(".rail-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".rail-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tabpanel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    });
  });

  // -- KPIs --
  function renderKpis() {
    document.getElementById("kpi-arrivals").textContent = arrivals.length;
    document.getElementById("kpi-inhouse").textContent = inHouse.length;
    document.getElementById("kpi-departures").textContent = D.departures.length;
    document.getElementById("kpi-unassigned").textContent = arrivals.reduce(
      (n, r) => n + r.unassignedRooms,
      0,
    );
    document.getElementById("count-arrivals").textContent = arrivals.length;
    document.getElementById("count-departures").textContent = D.departures.length;
  }

  // -- arrivals table --
  function renderArrivals() {
    const body = document.getElementById("arrivals-body");
    body.innerHTML = "";
    arrivals.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="ref">${r.reference}</td>
        <td><span class="guest">${r.guest}</span>${r.notes ? `<span class="notes">${r.notes}</span>` : ""}</td>
        <td>${window.fmtDate(r.arrival)} → ${window.fmtDate(r.departure)}</td>
        <td>${
          r.unassignedRooms > 0
            ? `<span class="badge badge-flag">${r.unassignedRooms} unassigned</span>`
            : `<span class="badge badge-ok">Room ${r.assignedRoom}</span>`
        }</td>
        <td class="actions-col"></td>
      `;
      const actions = tr.querySelector(".actions-col");
      if (r.unassignedRooms > 0) {
        const assignBtn = document.createElement("button");
        assignBtn.className = "btn";
        assignBtn.textContent = "Auto-assign";
        assignBtn.addEventListener("click", () => {
          r.unassignedRooms = 0;
          r.assignedRoom = String(100 + Math.floor(Math.random() * 300));
          renderArrivals();
          renderKpis();
          toast(`Rooms assigned for ${r.reference}`);
        });
        actions.appendChild(assignBtn);
      }
      const checkInBtn = document.createElement("button");
      checkInBtn.className = "btn btn-primary";
      checkInBtn.textContent = "Check in";
      checkInBtn.disabled = r.unassignedRooms > 0;
      checkInBtn.addEventListener("click", () => {
        toast(`${r.reference} checked in`);
        const idx = arrivals.indexOf(r);
        arrivals.splice(idx, 1);
        renderArrivals();
        renderKpis();
      });
      actions.appendChild(checkInBtn);
      body.appendChild(tr);
    });
    if (!arrivals.length) {
      body.innerHTML = `<tr><td colspan="5" class="empty">No arrivals remaining.</td></tr>`;
    }
  }

  // -- in-house / departures --
  function renderGuestTable(bodyId, rows, showDeparture) {
    const body = document.getElementById(bodyId);
    body.innerHTML = "";
    rows.forEach((r) => {
      const owes = r.balanceMinor !== 0;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="ref">${r.reference}</td>
        <td class="guest">${r.guest}</td>
        <td>${r.room}</td>
        ${showDeparture ? `<td>${window.fmtDate(r.departure)}</td>` : ""}
        <td class="num-cell"><span class="money ${owes ? "owes" : ""}">${window.formatMoney(r.balanceMinor, r.currency)}</span></td>
        <td class="actions-col"></td>
      `;
      const btn = document.createElement("button");
      btn.className = "btn btn-primary";
      btn.textContent = owes ? "Check out anyway" : "Check out";
      btn.addEventListener("click", () => {
        toast(`${r.reference} checked out`);
        const idxIH = inHouse.indexOf(r);
        if (idxIH > -1) inHouse.splice(idxIH, 1);
        const idxDep = D.departures.indexOf(r);
        if (idxDep > -1) D.departures.splice(idxDep, 1);
        renderGuestTable("inhouse-body", inHouse, false);
        renderGuestTable("departures-body", D.departures, false);
        renderKpis();
      });
      tr.querySelector(".actions-col").appendChild(btn);
      body.appendChild(tr);
    });
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="6" class="empty">Nothing here.</td></tr>`;
    }
  }

  // -- walk-in --
  let pick = null;
  function renderOffers() {
    const wrap = document.getElementById("wi-offers");
    wrap.innerHTML = "";
    D.roomTypes.forEach((rt) => {
      const offer = document.createElement("div");
      offer.className = "offer";
      offer.innerHTML = `
        <div class="offer-head">
          <span class="name">${rt.name}</span>
          <span class="avail">${rt.unitsAvailable} available</span>
        </div>
      `;
      rt.ratePlans.forEach((rp) => {
        const selected = pick && pick.roomTypeId === rt.id && pick.ratePlanId === rp.id;
        const row = document.createElement("div");
        row.className = "rate-option" + (rp.sellable ? "" : " disabled");
        row.innerHTML = `
          <button class="btn ${selected ? "btn-primary" : ""}" ${
          !rp.sellable || rt.unitsAvailable < 1 ? "disabled" : ""
        }>${selected ? "Selected" : "Pick"}</button>
          <span class="rname">${rp.name}</span>
          <span class="rprice">${window.formatMoney(rp.totalMinor, rp.currency)}</span>
        `;
        row.querySelector("button").addEventListener("click", () => {
          pick = { roomTypeId: rt.id, ratePlanId: rp.id };
          renderOffers();
        });
        offer.appendChild(row);
      });
      wrap.appendChild(offer);
    });
  }

  document.getElementById("wi-submit").addEventListener("click", () => {
    if (!pick) return toast("Choose a room first");
    const first = document.getElementById("wi-first").value.trim();
    const last = document.getElementById("wi-last").value.trim();
    if (!first || !last) return toast("Guest name required");
    toast(`Walk-in created for ${first} ${last} & checked in`);
    document.getElementById("wi-first").value = "";
    document.getElementById("wi-last").value = "";
    pick = null;
    renderOffers();
  });

  renderKpis();
  renderArrivals();
  renderGuestTable("inhouse-body", inHouse, true);
  renderGuestTable("departures-body", D.departures, false);
  renderOffers();
})();
