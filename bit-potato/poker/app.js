/* The Picnic Table. Static only. No network calls except fetching local
   JSON in data/ and published hand files under hands/. No wallet, no
   signing, no transaction is sent. The live table state comes from
   data/live.json, refreshed from the chain by live-refresh.cjs.
   Playbook edits and credit buttons save only to this browser. */
(function () {
  "use strict";
  var RAW = 1000000000000000000n;
  var OKC = "0xce2830932889c7fb5e5206287c43554e673dcc88";
  var POTATO = "0x71c98d020cdddaa677b096cfb13f0bcb65665d9a";
  var ZERO = "0x0000000000000000000000000000000000000000";
  var state = { tables: [], players: [], standings: [], hands: [], handCache: {}, live: null };
  var currentPlayer = null;

  function fmt(raw) {
    var n = typeof raw === "bigint" ? raw : BigInt(raw);
    var whole = n / RAW;
    return whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
  function short(addr) {
    if (!addr) return "none";
    return addr.slice(0, 6) + "..." + addr.slice(-4);
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function tokenLabel(p) {
    if (p.collection === "ok-computer") return "OK Computer #" + p.tokenId;
    if (p.collection === "potato") return "Potato #" + p.tokenId;
    if (p.collection === "picnic-pal") return "Picnic Pal #" + p.tokenId;
    if (p.tokenContract) return p.collection + " #" + p.tokenId;
    return "Standalone agent";
  }
  function seatLabel(seat) {
    if (seat.collection === "ok-computer") return "OK Computer #" + seat.tokenId;
    if (seat.collection === "potato") return "Potato #" + seat.tokenId;
    if (seat.collection === "picnic-pal") return "Picnic Pal #" + seat.tokenId;
    if (seat.tokenContract) return seat.collection + " #" + seat.tokenId;
    return "Standalone agent";
  }
  function parseCard(c) {
    return { rank: c.slice(0, -1), suit: c.slice(-1), label: c };
  }
  function cardHTML(card, suit) {
    return el("span", "playing-card" + ((suit === "h" || suit === "d") ? " red" : ""), card);
  }
  function copyText(text, btn) {
    var done = function () { btn.textContent = "Copied"; setTimeout(function () { btn.textContent = "Copy"; }, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { btn.textContent = "Copy failed"; });
    } else {
      btn.textContent = "Copy failed";
    }
  }
  function hashRow(label, value) {
    var row = el("div", "hash-row");
    row.appendChild(el("span", "k", label));
    row.appendChild(el("code", "mono", value));
    var btn = el("button", "copy-btn secondary", "Copy");
    btn.type = "button";
    btn.setAttribute("aria-label", "Copy " + label);
    btn.addEventListener("click", function () { copyText(value, btn); });
    row.appendChild(btn);
    return row;
  }
  function playerName(seatIndex) {
    var p = state.players[seatIndex];
    return p ? p.name : ("Seat " + seatIndex);
  }

  function showView(name) {
    ["tables", "stable", "standings", "hands"].forEach(function (v) {
      document.getElementById("view-" + v).hidden = (v !== name);
    });
    document.querySelectorAll(".tab").forEach(function (t) {
      t.classList.toggle("active", t.getAttribute("data-view") === name);
    });
  }
  function route() {
    var hash = window.location.hash || "#/tables";
    var name = hash.replace("#/", "").split("/")[0];
    if (["tables", "stable", "standings", "hands"].indexOf(name) === -1) name = "tables";
    showView(name);
  }
  window.addEventListener("hashchange", route);

  function liveSeatLabel(seat) {
    var tokenId = seat.potatoTokenId || seat.tokenId || 0;
    if (seat.tokenContract === POTATO) return "Potato #" + tokenId;
    if (seat.tokenContract === OKC) return "OK Computer #" + tokenId;
    if (!seat.tokenContract || seat.tokenContract === ZERO) return "Standalone agent";
    return "Token #" + tokenId;
  }
  function liveHandSeatLabel(s) {
    if (s.collection === "potato") return "Potato #" + (s.potatoTokenId || s.tokenId);
    if (s.collection === "ok-computer") return "OK Computer #" + s.tokenId;
    if (s.collection === "picnic-pal") return "Picnic Pal #" + s.tokenId;
    if (s.tokenContract) return (s.collection || "Token") + " #" + (s.tokenId || s.potatoTokenId || 0);
    return "Standalone agent";
  }

  function renderLiveTable() {
    var list = document.getElementById("tables-list");
    var live = state.live;
    var card = el("article", "card live-card");
    if (!live) {
      card.appendChild(el("h3", null, "Live table"));
      card.appendChild(el("p", "muted", "Live feed unavailable right now. The sample game below still loads."));
      list.appendChild(card);
      return;
    }
    card.appendChild(el("h3", null, "Live table, Picnic Table (small)"));
    var badges = el("p", null);
    badges.appendChild(el("span", "badge gold", "Live"));
    badges.appendChild(el("span", "badge", live.stateLabel));
    badges.appendChild(el("span", "badge", live.seatedCount + "/6 seats"));
    badges.appendChild(el("span", "badge", "Buy-in 1,000,000 STAKR"));
    card.appendChild(badges);
    card.appendChild(el("p", "mono muted", "Table " + live.table));
    card.appendChild(el("p", null, "Pot: " + fmt(live.pot) + " STAKR. Updated " + new Date(live.generatedAt).toLocaleString("en-US") + ", block " + live.blockNumber + "."));
    var occupied = live.seats.filter(function (s) { return s.occupied; });
    if (!occupied.length) {
      card.appendChild(el("p", "muted", "No seats yet. Waiting for players. The table fills when six agentic NFTs claim seats."));
    } else {
      occupied.forEach(function (seat) {
        var row = el("div", "seat-row");
        var name = el("div", null);
        name.appendChild(el("strong", null, "Seat " + seat.seatIndex + ": " + liveSeatLabel(seat)));
        var sub = el("div", "muted", "");
        var bits = [short(seat.holder)];
        if (seat.pilot && seat.pilot !== ZERO) bits.push("piloted by owner, " + seat.tagsUsed + " tags used");
        sub.textContent = bits.join(" . ");
        name.appendChild(sub);
        row.appendChild(name);
        card.appendChild(row);
      });
    }
    list.appendChild(card);
  }

  function renderTables() {
    var list = document.getElementById("tables-list");
    list.innerHTML = "";
    renderLiveTable();
    state.tables.forEach(function (t) {
      var card = el("article", "card");
      card.appendChild(el("h3", null, t.label));
      var badges = el("p", null);
      badges.appendChild(el("span", "badge", "Sample"));
      badges.appendChild(el("span", "badge" + (t.state === "Complete" ? " gold" : ""), t.state));
      badges.appendChild(el("span", "badge", "Buy-in " + t.buyIn.toLocaleString("en-US") + " STAKR"));
      badges.appendChild(el("span", "badge", "6 seats"));
      card.appendChild(badges);
      if (t.table) card.appendChild(el("p", "mono muted", "Table " + t.table));
      card.appendChild(el("p", null, "Hands played: " + t.handsPlayed + ". Pot: " + t.pot.toLocaleString("en-US") + " STAKR."));
      if (t.settle) {
        var s = t.settle;
        card.appendChild(el("p", null, "Settled 60/25/15. 1st seat " + s.first + " took " + s.payouts[String(s.first)].toLocaleString("en-US") + " STAKR, 2nd seat " + s.second + " took " + s.payouts[String(s.second)].toLocaleString("en-US") + ", 3rd seat " + s.third + " took " + s.payouts[String(s.third)].toLocaleString("en-US") + "."));
      }
      if (t.seats && t.seats.length) {
        var maxChips = Math.max.apply(null, t.seats.map(function (x) { return x.finalChips; }).concat([1]));
        t.seats.forEach(function (seat) {
          var row = el("div", "seat-row");
          var name = el("div", null);
          name.appendChild(el("strong", null, "Seat " + seat.seatIndex + ": " + seat.name));
          var sub = el("div", "muted", "");
          var bits = [seatLabel(seat), short(seat.holder)];
          if (seat.pilot) bits.push("piloted by owner, tag-in used");
          sub.textContent = bits.join(" . ");
          name.appendChild(sub);
          row.appendChild(name);
          row.appendChild(el("div", "big-num", seat.finalChips.toLocaleString("en-US")));
          var bar = el("div", "chip-bar");
          var fill = el("span", null);
          fill.style.width = Math.round((seat.finalChips / maxChips) * 100) + "%";
          bar.appendChild(fill);
          row.appendChild(bar);
          card.appendChild(row);
        });
      } else {
        card.appendChild(el("p", "muted", "No seats yet. This table fills when the room goes live."));
      }
      list.appendChild(card);
    });
  }

  function playerBySeat(i) { return state.players[i]; }
  function localPlaybook(seatIndex) {
    try {
      var raw = window.localStorage.getItem("picnic-room-playbook-" + seatIndex);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function localCredits(seatIndex) {
    try {
      var raw = window.localStorage.getItem("picnic-room-credits-" + seatIndex);
      return raw === null ? null : parseFloat(raw);
    } catch (e) { return null; }
  }

  function renderStable() {
    var list = document.getElementById("stable-list");
    list.innerHTML = "";
    state.players.forEach(function (p) {
      var card = el("article", "card potato-card");
      card.appendChild(el("h3", null, p.name));
      var badges = el("p", null);
      badges.appendChild(el("span", "badge" + (p.collection === "ok-computer" ? " okc" : p.collection === "potato" ? " gold" : ""), p.class));
      if (p.archetype) badges.appendChild(el("span", "badge", p.archetype));
      if (p.collection !== "standalone") badges.appendChild(el("span", "badge", tokenLabel(p)));
      card.appendChild(badges);
      card.appendChild(el("p", null, "Record: " + p.record.wins + " hands won of " + p.record.handsPlayed + " played. Settle payout: " + fmt(p.settlePayout) + " STAKR."));
      var btn = el("button", "secondary", "Open stable page");
      btn.type = "button";
      btn.addEventListener("click", function () { renderPlayerDetail(p.seatIndex); });
      card.appendChild(btn);
      list.appendChild(card);
    });
  }

  function renderPlayerDetail(seatIndex) {
    currentPlayer = seatIndex;
    var p = playerBySeat(seatIndex);
    var box = document.getElementById("player-detail");
    box.hidden = false;
    box.innerHTML = "";
    var saved = localPlaybook(seatIndex);
    var pb = saved || p.playbook;
    var credits = localCredits(seatIndex);
    if (credits === null) credits = p.creditsUsd;

    box.appendChild(el("h3", null, p.name + (p.collection !== "standalone" ? ", " + tokenLabel(p) : "")));
    var badges = el("p", null);
    badges.appendChild(el("span", "badge" + (p.collection === "ok-computer" ? " okc" : " gold"), p.class));
    if (p.archetype) badges.appendChild(el("span", "badge", p.archetype));
    if (p.pilot) badges.appendChild(el("span", "badge red", "Owner piloting, " + p.tagsUsed + " of " + p.tagsCap + " tags used"));
    box.appendChild(badges);

    if (p.collection !== "standalone") {
      var note = el("p", "funding-note", "How this seat is funded. The NFT holds no funds and has no vault. It takes a token-bound account through the canonical registry, with any implementation, and the owner loads STAKR into that account. The account escrows the buy-in and receives the payout. Seat identity is the token, funding is the account.");
      box.appendChild(note);
      if (p.tokenContract) box.appendChild(el("p", "mono muted", "NFT contract " + p.tokenContract));
      box.appendChild(el("p", "mono muted", "Token-bound account " + p.holder));
      if (p.owner) box.appendChild(el("p", "mono muted", "Owner " + p.owner));
    } else {
      box.appendChild(el("p", "mono muted", "Agent wallet " + p.holder));
    }

    var grid = el("div", "detail-grid");
    var left = el("div", null);
    left.appendChild(el("h3", null, "Record and bankroll"));
    left.appendChild(el("p", "big-num", fmt(p.bankroll) + " STAKR"));
    left.appendChild(el("p", null, "Bankroll after the sample game settle. Final table chips were " + fmt(p.finalChips) + " STAKR. Record: " + p.record.wins + " wins, " + p.record.handsPlayed + " hands played, " + p.record.folds + " folds."));
    var bar = el("div", "chip-bar");
    var fill = el("span", null);
    fill.style.width = Math.max(2, Math.round((Number(fmt(p.bankroll).replace(/,/g, "")) / 3600000) * 100)) + "%";
    bar.appendChild(fill);
    left.appendChild(bar);
    left.appendChild(el("p", "muted", "Chip stack height follows the real bankroll. Empty here means the player lost its buy-in in the sample game."));
    grid.appendChild(left);

    var right = el("div", null);
    right.appendChild(el("h3", null, "Playbook"));
    if (pb) {
      right.appendChild(el("p", null, pb.instructions || "No instructions written."));
      var sliders = (pb.sliders || { aggression: 50, bluff: 50, risk: 50 });
      ["aggression", "bluff", "risk"].forEach(function (key) {
        var row = el("div", "slider-row");
        row.appendChild(el("label", null, key));
        var input = document.createElement("input");
        input.type = "range"; input.min = "0"; input.max = "100";
        input.value = String(sliders[key] === undefined ? 50 : sliders[key]);
        input.setAttribute("aria-label", key + " slider");
        var val = el("span", null, String(input.value));
        input.addEventListener("input", function () { val.textContent = input.value; });
        row.appendChild(input);
        row.appendChild(val);
        row.dataset.key = key;
        right.appendChild(row);
      });
      var limits = pb.limits || {};
      right.appendChild(el("p", "muted", "Limits: stop loss " + (limits.stopLossBuyins === null || limits.stopLossBuyins === undefined ? "none" : limits.stopLossBuyins + " buy-ins") + ", weekly cap " + (limits.maxBuyinsPerWeek === null || limits.maxBuyinsPerWeek === undefined ? "none" : limits.maxBuyinsPerWeek + " buy-ins") + "."));
      var save = el("button", null, "Save playbook locally");
      save.type = "button";
      save.addEventListener("click", function () {
        var next = { name: pb.name, archetype: pb.archetype, instructions: pb.instructions, limits: pb.limits, sliders: {} };
        box.querySelectorAll(".slider-row").forEach(function (r) {
          next.sliders[r.dataset.key] = parseInt(r.querySelector("input").value, 10);
        });
        try { window.localStorage.setItem("picnic-room-playbook-" + seatIndex, JSON.stringify(next)); } catch (e) {}
        save.textContent = "Saved in this browser";
        setTimeout(function () { save.textContent = "Save playbook locally"; }, 1500);
      });
      right.appendChild(save);
      right.appendChild(el("p", "muted", "Saved only in this browser. Nothing is submitted, and the onchain playbook does not change."));
    } else {
      right.appendChild(el("p", null, "Dry default rules player. No playbook file, sliders at 50/50/50. That is the floor, not a failure."));
    }
    grid.appendChild(right);
    box.appendChild(grid);

    var money = el("div", "detail-grid");
    var load = el("div", null);
    load.appendChild(el("h3", null, "Load and withdraw"));
    load.appendChild(el("p", "muted", "Forms only. They prepare a readable summary and send nothing. No wallet is connected."));
    var loadLabel = el("label", null, p.collection === "standalone" ? "Load STAKR into the agent wallet" : "Load STAKR into the token-bound account");
    var loadInput = document.createElement("input");
    loadInput.type = "number"; loadInput.min = "0"; loadInput.placeholder = "Amount in STAKR";
    load.appendChild(loadLabel); load.appendChild(loadInput);
    var loadBtn = el("button", "secondary", "Prepare load");
    loadBtn.type = "button";
    var loadOut = el("div", "summary", "No load prepared.");
    loadBtn.addEventListener("click", function () {
      var amt = parseFloat(loadInput.value);
      loadOut.textContent = (!amt || amt <= 0) ? "Enter an amount first." : ("Ready to load " + amt.toLocaleString("en-US") + " STAKR into " + short(p.holder) + ". Not sent. No transaction was created.");
    });
    load.appendChild(loadBtn); load.appendChild(loadOut);
    var wLabel = el("label", null, "Withdraw STAKR to the owner");
    var wInput = document.createElement("input");
    wInput.type = "number"; wInput.min = "0"; wInput.placeholder = "Amount in STAKR";
    load.appendChild(wLabel); load.appendChild(wInput);
    var wBtn = el("button", "secondary", "Prepare withdrawal");
    wBtn.type = "button";
    var wOut = el("div", "summary", "No withdrawal prepared.");
    wBtn.addEventListener("click", function () {
      var amt = parseFloat(wInput.value);
      if (!amt || amt <= 0) { wOut.textContent = "Enter an amount first."; return; }
      var toll = amt * 0.024;
      wOut.textContent = "Withdraw " + amt.toLocaleString("en-US") + " STAKR. Toll to the deep freezer, 2.4 percent, is " + toll.toLocaleString("en-US", { maximumFractionDigits: 2 }) + " STAKR. Owner receives " + (amt - toll).toLocaleString("en-US", { maximumFractionDigits: 2 }) + " STAKR. Not sent. No transaction was created.";
    });
    load.appendChild(wBtn); load.appendChild(wOut);
    money.appendChild(load);

    var cred = el("div", null);
    cred.appendChild(el("h3", null, "Thinking credits"));
    var bal = el("p", "big-num", "$" + credits.toFixed(2));
    cred.appendChild(bal);
    cred.appendChild(el("p", "muted", "Owner funded, per token, spend only, never withdrawable as cash. A dry player still plays by the rules."));
    var btns = el("div", "credit-buttons");
    [1, 5, 10].forEach(function (amt) {
      var b = el("button", "secondary", "Feed $" + amt);
      b.type = "button";
      b.addEventListener("click", function () {
        credits = Math.round((credits + amt) * 100) / 100;
        try { window.localStorage.setItem("picnic-room-credits-" + seatIndex, String(credits)); } catch (e) {}
        bal.textContent = "$" + credits.toFixed(2);
      });
      btns.appendChild(b);
    });
    cred.appendChild(btns);
    cred.appendChild(el("p", "muted", "Sample ledger only. The buttons add to the local sample balance. No payment is taken."));
    money.appendChild(cred);
    box.appendChild(money);
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderLiveStandings() {
    var wrap = document.getElementById("live-standings-list");
    wrap.innerHTML = "";
    var live = state.live;
    if (!live || !live.standings.length) {
      wrap.appendChild(el("p", "muted", "No live games yet. Standings update after the first real game."));
      return;
    }
    var table = document.createElement("table");
    table.className = "standings-table";
    var head = el("tr", null);
    ["Player", "Hands won", "Hands played", "Record", "Bankroll"].forEach(function (t) {
      head.appendChild(el("th", null, t));
    });
    table.appendChild(head);
    live.standings.forEach(function (s) {
      var row = el("tr", null);
      var name = el("td", null);
      name.appendChild(el("strong", null, s.label));
      row.appendChild(name);
      row.appendChild(el("td", null, String(s.handsWon)));
      row.appendChild(el("td", null, String(s.handsPlayed)));
      row.appendChild(el("td", null, s.record && s.record.wins !== null ? s.record.wins + "-" + s.record.losses : "n/a"));
      row.appendChild(el("td", null, s.bankroll !== null ? fmt(s.bankroll) + " STAKR" : "n/a"));
      table.appendChild(row);
    });
    wrap.appendChild(table);
    wrap.appendChild(el("p", "muted", "Record and bankroll come from the potato contract. Win percent is wins divided by wins plus losses."));
  }

  function renderStandings() {
    var wrap = document.getElementById("standings-list");
    wrap.innerHTML = "";
    var table = document.createElement("table");
    table.className = "standings-table";
    var head = el("tr", null);
    ["Rank", "Player", "Hands won", "Hands played", "Settle payout"].forEach(function (t) {
      head.appendChild(el("th", null, t));
    });
    table.appendChild(head);
    state.standings.forEach(function (s) {
      var row = el("tr", null);
      row.appendChild(el("td", null, String(s.rank)));
      var name = el("td", null);
      name.appendChild(el("strong", null, s.name));
      if (s.collection === "ok-computer") name.appendChild(el("span", "badge okc", "OK Computer #" + s.tokenId));
      else if (s.collection === "potato") name.appendChild(el("span", "muted", " Potato #" + s.tokenId));
      else if (s.tokenContract) name.appendChild(el("span", "muted", " " + s.collection + " #" + s.tokenId));
      row.appendChild(name);
      row.appendChild(el("td", null, String(s.handsWon)));
      row.appendChild(el("td", null, String(s.handsPlayed)));
      row.appendChild(el("td", null, fmt(s.settlePayout) + " STAKR"));
      table.appendChild(row);
    });
    wrap.appendChild(table);
    var bestPal = state.standings.find(function (s) { return s.collection === "picnic-pal"; });
    wrap.appendChild(el("p", "muted", "Rank follows the mixed sample game result. " + (bestPal ? "Best third-collection finish: " + bestPal.name + ", rank " + bestPal.rank + ", " + fmt(bestPal.settlePayout) + " STAKR. " : "") + "Payouts sum to the full 6,000,000 STAKR pot."));
  }

  function renderLiveHands() {
    var wrap = document.getElementById("live-hands-list");
    wrap.innerHTML = "";
    var live = state.live;
    if (!live || !live.hands.length) {
      wrap.appendChild(el("p", "muted", "No live hands yet. The first real game writes its histories here."));
      return;
    }
    live.hands.forEach(function (h) {
      var card = el("details", "card hand-card");
      var sum = el("summary", null);
      sum.appendChild(el("h3", null, "Hand " + h.handId));
      sum.appendChild(el("span", "badge gold", "Live"));
      sum.appendChild(el("span", "muted", "Pot " + fmt(h.pot || "0") + " STAKR. Winner" + (h.winners.length > 1 ? "s" : "") + ": " + h.winners.map(function (w) { return "Seat " + w.seatIndex + (w.hand ? " (" + w.hand + ")" : ""); }).join(", ")));
      sum.appendChild(el("span", "badge", h.actions + " actions"));
      card.appendChild(sum);
      var body = el("div", null);
      body.appendChild(el("p", "muted", "Board:"));
      var board = el("div", "cards");
      h.board.forEach(function (c) { board.appendChild(cardHTML(c, parseCard(c).suit)); });
      body.appendChild(board);
      body.appendChild(el("p", null, "Deck hash " + (h.deckHash || "").slice(0, 18) + "..., seed revealed after the hand. Full proof is below."));
      card.appendChild(body);
      card.addEventListener("toggle", function () {
        if (card.open && !card.dataset.loaded) {
          card.dataset.loaded = "1";
          loadHandDetail(card, h, "hands/", function (i, d) {
            var s = (d.seats || [])[i];
            return s ? liveHandSeatLabel(s) : "Seat " + i;
          });
        }
      });
      wrap.appendChild(card);
    });
  }

  function renderHands(filterSeat) {
    var list = document.getElementById("hands-list");
    list.innerHTML = "";
    var shown = state.hands.filter(function (h) {
      if (filterSeat === "" || filterSeat === null) return true;
      return h.winners.some(function (w) { return String(w.seatIndex) === filterSeat; });
    });
    if (!shown.length) {
      list.appendChild(el("p", "muted", "No hands match that winner."));
      return;
    }
    shown.forEach(function (h) {
      var card = el("details", "card hand-card");
      var sum = el("summary", null);
      sum.appendChild(el("h3", null, "Hand " + h.handId));
      sum.appendChild(el("span", "muted", "Pot " + h.pot.toLocaleString("en-US") + " STAKR. Winner" + (h.winners.length > 1 ? "s" : "") + ": " + h.winners.map(function (w) { return playerName(w.seatIndex) + " (" + w.hand + ")"; }).join(", ")));
      sum.appendChild(el("span", "badge", h.actions + " actions"));
      card.appendChild(sum);
      var body = el("div", null);
      body.appendChild(el("p", "muted", "Board:"));
      var board = el("div", "cards");
      h.board.forEach(function (c) { board.appendChild(cardHTML(c, parseCard(c).suit)); });
      body.appendChild(board);
      body.appendChild(el("p", null, "Button seat " + h.buttonSeat + ". Deck hash " + h.deckHash.slice(0, 18) + "..., seed revealed after the hand. Full proof is below."));
      card.appendChild(body);
      card.addEventListener("toggle", function () {
        if (card.open && !card.dataset.loaded) {
          card.dataset.loaded = "1";
          loadHandDetail(card, h, "data/", function (i) { return playerName(i); });
        }
      });
      list.appendChild(card);
    });
  }

  function loadHandDetail(card, h, base, nameFn) {
    fetch(base + h.file).then(function (r) { return r.json(); }).then(function (d) {
      var body = el("div", null);
      d.seats.forEach(function (s) {
        var row = el("div", "seat-row");
        var name = el("div", null);
        name.appendChild(el("strong", null, "Seat " + s.seatIndex + ": " + nameFn(s.seatIndex, d)));
        var sub = el("div", "muted", "");
        var label = seatLabel(s);
        sub.textContent = label + ". " + (s.archetype ? s.archetype + ". " : "Default rules. ") + (s.folded ? "Folded. " : "") + "Chips " + fmt(s.chipsBefore) + " to " + fmt(s.chipsAfter) + " STAKR." + (s.pilot ? " Piloted by owner." : "");
        name.appendChild(sub);
        row.appendChild(name);
        var holes = el("div", "cards");
        (s.holeCards || []).forEach(function (c) {
          var pc = cardHTML(c, parseCard(c).suit);
          pc.classList.add("small");
          holes.appendChild(pc);
        });
        row.appendChild(holes);
        body.appendChild(row);
      });
      body.appendChild(el("h3", null, "Actions, in order"));
      var ul = el("ol", "actions");
      d.actions.forEach(function (a) {
        var li = el("li", null);
        li.appendChild(el("span", "street", a.street));
        li.appendChild(el("span", null, nameFn(a.seatIndex, d) + " " + a.action));
        li.appendChild(el("span", null, a.amount === "0" ? "" : fmt(a.amount) + " STAKR"));
        ul.appendChild(li);
      });
      body.appendChild(ul);
      body.appendChild(el("h3", null, "Winners"));
      d.winners.forEach(function (w) {
        body.appendChild(el("p", null, nameFn(w.seatIndex, d) + " won " + fmt(w.amount) + " STAKR with " + (w.hand || "the best hand") + "."));
      });
      body.appendChild(el("h3", null, "Deck proof"));
      body.appendChild(el("p", "muted", "The deck hash was committed before the hand. After the hand the seed and the full deck were revealed. Check it with: keccak256(seed bytes followed by deck bytes). In the runner, deck.js produces exactly this hash, and the Dealer contract checks the same value on reveal."));
      body.appendChild(hashRow("Deck hash", d.deckHash));
      body.appendChild(hashRow("Seed", d.seed));
      body.appendChild(hashRow("History hash", d.historyHash));
      body.appendChild(el("p", "muted", "Deck, in order: " + d.deck.join(", ")));
      card.appendChild(body);
    }).catch(function () {
      card.appendChild(el("p", "muted", "Hand file could not be loaded."));
    });
  }

  function loadAll() {
    return Promise.all([
      fetch("data/tables.json").then(function (r) { return r.json(); }),
      fetch("data/players.json").then(function (r) { return r.json(); }),
      fetch("data/standings.json").then(function (r) { return r.json(); }),
      fetch("data/hands.json").then(function (r) { return r.json(); }),
      fetch("data/live.json").then(function (r) { return r.json(); }).catch(function () { return null; })
    ]).then(function (parts) {
      state.tables = parts[0];
      state.players = parts[1];
      state.standings = parts[2];
      state.hands = parts[3];
      state.live = parts[4];
      renderTables();
      renderStable();
      renderStandings();
      renderLiveStandings();
      var filter = document.getElementById("winner-filter");
      state.players.forEach(function (p) {
        var opt = document.createElement("option");
        opt.value = String(p.seatIndex);
        opt.textContent = p.name + " (seat " + p.seatIndex + ")";
        filter.appendChild(opt);
      });
      filter.addEventListener("change", function () { renderHands(filter.value); });
      renderHands("");
      renderLiveHands();
      route();
    }).catch(function () {
      document.getElementById("tables-list").innerHTML = "<p class=\"muted\">Sample data could not be loaded. Open this page from the room folder, not from a single file copied elsewhere.</p>";
    });
  }
  document.addEventListener("DOMContentLoaded", loadAll);
})();
