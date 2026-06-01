/**
 * RewardVerse SPA Front-End Core Client Logic [v3.0]
 */

const BACKEND_BASE = "https://rewardverse-backend-s059.onrender.com"; // Update this with your live deployment URL
const DEFAULT_ADS_BLOCK_ID = "8392"; // Configured inside AdsGram dashboard interface

// Local state representation cache
let state = {
    user: {
        telegram_id: 123456,
        username: "GuestPlayer",
        first_name: "Premium",
        last_name: "Challenger",
        current_coins: 0.00,
        xp: 0,
        current_level: 1,
        total_earned_coins: 0.00,
        referral_count: 0,
        achievement_count: 0
    },
    transactions: [],
    withdrawals: [],
    current_tab: "home",
    isCheckingIn: false,
    lastAdClaimed: 0
};

/**
 * 1. Initialize IndexedDB Layer wrapper for local offline storage caching
 */
const dbService = {
    db: null,
    init() {
        return new Promise((resolve) => {
            const request = indexedDB.open("RewardVerseLocalCache", 1);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                db.createObjectStore("app_state", { keyPath: "key" });
            };
            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve();
            };
        });
    },
    async get(key) {
        if (!this.db) await this.init();
        return new Promise((resolve) => {
            const tx = this.db.transaction("app_state", "readonly");
            const store = tx.objectStore("app_state");
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result ? req.result.value : null);
        });
    },
    async set(key, value) {
        if (!this.db) await this.init();
        return new Promise((resolve) => {
            const tx = this.db.transaction("app_state", "readwrite");
            const store = tx.objectStore("app_state");
            store.put({ key, value });
            tx.oncomplete = () => resolve();
        });
    }
};

/**
 * Telegram SDK Hook Interface
 */
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();
}

/**
 * Custom Toast Notifications Controller
 */
function showToast(message, type = "success") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `glass-panel flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg transform translate-y-2 opacity-0 transition-all duration-300 pointer-events-auto`;
    
    if (type === "success") {
        toast.classList.add("border-emerald-500/30", "bg-emerald-950/60", "text-emerald-400");
        toast.innerHTML = `<i data-lucide="check-circle" class="w-5 h-5 text-emerald-400"></i><span class="text-sm font-medium">${message}</span>`;
    } else {
        toast.classList.add("border-rose-500/30", "bg-rose-950/60", "text-rose-400");
        toast.innerHTML = `<i data-lucide="alert-triangle" class="w-5 h-5 text-rose-400"></i><span class="text-sm font-medium">${message}</span>`;
    }

    container.appendChild(toast);
    lucide.createIcons();

    // Trigger Entrance animation after minor delay tick
    setTimeout(() => {
        toast.classList.remove("translate-y-2", "opacity-0");
    }, 50);

    // Fade out and cleanup
    setTimeout(() => {
        toast.classList.add("opacity-0", "translate-y--2");
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

/**
 * Secure Server Authenticated API Dispatcher
 */
async function requestAPI(endpoint, method = "GET", body = null) {
    const headers = { "Content-Type": "application/json" };
    if (tg && tg.initData) {
        headers["x-telegram-init-data"] = tg.initData;
    }

    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    try {
        const response = await fetch(`${BACKEND_BASE}${endpoint}`, options);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "System process failure");
        return data;
    } catch (err) {
        showToast(err.message, "error");
        console.error("[API Fail]", err);
        return null;
    }
}

/**
 * SPA Dynamic Router Engine
 */
const routes = {
    home: {
        render: () => {
            const user = state.user;
            const xpPercentage = Math.min(100, Math.floor((user.xp / (user.current_level * 100)) * 100));
            const badge = user.current_level < 10 ? "Bronze" : user.current_level < 25 ? "Silver" : "Gold";

            return `
                <div class="flex items-center justify-between mb-6">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 rounded-full bg-gradient-to-tr from-yellow-500 to-amber-600 flex items-center justify-center font-bold text-lg text-gray-950 shadow-md">
                            ${user.first_name[0]}
                        </div>
                        <div>
                            <p class="text-sm text-gray-400">Welcome back,</p>
                            <h2 class="text-lg font-bold text-white">${user.first_name} ${user.last_name || ""}</h2>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 bg-gray-900 border border-gray-800 px-3 py-1.5 rounded-full">
                        <i data-lucide="coins" class="w-5 h-5 text-yellow-500"></i>
                        <span class="font-black text-yellow-400">${parseFloat(user.current_coins).toLocaleString()}</span>
                    </div>
                </div>

                <!-- Level Progress Card -->
                <div class="glass-panel p-5 mb-6 glow-card">
                    <div class="flex justify-between items-center mb-2">
                        <span class="text-xs font-bold text-yellow-500 uppercase tracking-wider">${badge} Tier</span>
                        <span class="text-xs text-gray-400">Level ${user.current_level}</span>
                    </div>
                    <div class="w-full bg-gray-800 h-3.5 rounded-full overflow-hidden mb-2">
                        <div class="bg-gradient-to-r from-yellow-500 to-amber-500 h-full rounded-full transition-all duration-500" style="width: ${xpPercentage}%"></div>
                    </div>
                    <div class="flex justify-between text-xs text-gray-400">
                        <span>${user.xp} XP</span>
                        <span>${user.current_level * 100} XP for Level Up</span>
                    </div>
                </div>

                <!-- Daily Check-In Row -->
                <div class="glass-panel p-5 mb-6">
                    <h3 class="font-bold text-sm mb-4 flex items-center gap-2">
                        <i data-lucide="calendar" class="w-5 h-5 text-yellow-500"></i> Daily Streak Rewards
                    </h3>
                    <div class="grid grid-cols-7 gap-2">
                        ${[10, 20, 30, 50, 70, 90, 100].map((coins, index) => `
                            <div class="flex flex-col items-center bg-gray-950/80 border border-gray-800 rounded-lg p-2">
                                <span class="text-[10px] text-gray-400">D${index + 1}</span>
                                <i data-lucide="coins" class="w-4 h-4 text-yellow-500 my-1"></i>
                                <span class="text-[10px] font-bold text-white">+${coins}</span>
                            </div>
                        `).join("")}
                    </div>
                    <button onclick="claimDailyStreak()" class="w-full bg-yellow-500 hover:bg-yellow-400 text-gray-950 font-bold py-3 px-4 rounded-xl mt-4 transition-all flex items-center justify-center gap-2">
                        <i data-lucide="check-circle" class="w-5 h-5"></i> Claim Today's Reward
                    </button>
                </div>

                <!-- Dashboard Statistics Dashboard Grid -->
                <div class="grid grid-cols-2 gap-4 mb-6">
                    <div class="glass-panel p-4 flex flex-col justify-between">
                        <span class="text-xs text-gray-400">Earned Historically</span>
                        <span class="text-xl font-black text-white mt-1">${parseFloat(user.total_earned_coins).toLocaleString()}</span>
                    </div>
                    <div class="glass-panel p-4 flex flex-col justify-between">
                        <span class="text-xs text-gray-400">Invited Network</span>
                        <span class="text-xl font-black text-white mt-1">${user.referral_count} Friends</span>
                    </div>
                </div>
            `;
        }
    },
    missions: {
        render: () => {
            return `
                <div class="mb-6">
                    <h2 class="text-2xl font-bold mb-1">Missions Dashboard</h2>
                    <p class="text-xs text-gray-400">Complete tasks to earn gold and level up your player profile tier</p>
                </div>

                <div class="space-y-4">
                    <div class="glass-panel p-4 flex items-center justify-between">
                        <div class="flex items-start gap-3">
                            <div class="bg-blue-950/40 p-2.5 rounded-lg border border-blue-500/30 text-blue-400">
                                <i data-lucide="globe" class="w-5 h-5"></i>
                            </div>
                            <div>
                                <h4 class="font-bold text-sm text-white">Join Telegram Channel</h4>
                                <p class="text-xs text-gray-400 mt-1">Join the official updates community channel</p>
                                <span class="text-[10px] font-semibold text-yellow-500 inline-block mt-2">+100 Coins | +20 XP</span>
                            </div>
                        </div>
                        <button onclick="handleVerifyMission('tg_channel')" class="bg-yellow-500 hover:bg-yellow-400 text-gray-950 px-4 py-2 rounded-lg text-xs font-bold transition-colors">
                            Claim
                        </button>
                    </div>

                    <div class="glass-panel p-4 flex items-center justify-between">
                        <div class="flex items-start gap-3">
                            <div class="bg-purple-950/40 p-2.5 rounded-lg border border-purple-500/30 text-purple-400">
                                <i data-lucide="video" class="w-5 h-5"></i>
                            </div>
                            <div>
                                <h4 class="font-bold text-sm text-white">Watch Sponsored Video</h4>
                                <p class="text-xs text-gray-400 mt-1">Complete 1 rewarded video from sponsors</p>
                                <span class="text-[10px] font-semibold text-yellow-500 inline-block mt-2">+50 Coins | +15 XP</span>
                            </div>
                        </div>
                        <button onclick="triggerRewardedAds()" class="bg-yellow-500 hover:bg-yellow-400 text-gray-950 px-4 py-2 rounded-lg text-xs font-bold transition-colors">
                            Watch Ad
                        </button>
                    </div>
                </div>
            `;
        }
    },
    games: {
        render: () => {
            return `
                <div class="mb-6">
                    <h2 class="text-2xl font-bold mb-1">Gaming Arena</h2>
                    <p class="text-xs text-gray-400">Select an interactive mini-game and compete for coins</p>
                </div>

                <div class="grid grid-cols-1 gap-4">
                    <div onclick="initLuckySpin()" class="glass-panel p-4 flex items-center gap-4 cursor-pointer hover:border-yellow-500/40 transition-all">
                        <div class="bg-yellow-500/10 p-4 rounded-xl text-yellow-500 border border-yellow-500/30">
                            <i data-lucide="rotate-cw" class="w-8 h-8"></i>
                        </div>
                        <div>
                            <h3 class="font-bold text-white">Lucky Wheel Spinner</h3>
                            <p class="text-xs text-gray-400 mt-0.5">Test your fortune and spin for coin multipliers</p>
                        </div>
                    </div>

                    <div onclick="initNumberGuess()" class="glass-panel p-4 flex items-center gap-4 cursor-pointer hover:border-yellow-500/40 transition-all">
                        <div class="bg-emerald-500/10 p-4 rounded-xl text-emerald-500 border border-emerald-500/30">
                            <i data-lucide="help-circle" class="w-8 h-8"></i>
                        </div>
                        <div>
                            <h3 class="font-bold text-white">Number Guessing</h3>
                            <p class="text-xs text-gray-400 mt-0.5">Guess the system secret integer to win big</p>
                        </div>
                    </div>

                    <div onclick="initMemoryMatch()" class="glass-panel p-4 flex items-center gap-4 cursor-pointer hover:border-yellow-500/40 transition-all">
                        <div class="bg-indigo-500/10 p-4 rounded-xl text-indigo-500 border border-indigo-500/30">
                            <i data-lucide="grid" class="w-8 h-8"></i>
                        </div>
                        <div>
                            <h3 class="font-bold text-white">Memory Card Match</h3>
                            <p class="text-xs text-gray-400 mt-0.5">Improve your recall speed and beat the timer</p>
                        </div>
                    </div>

                    <div onclick="initTapSpeedChallenge()" class="glass-panel p-4 flex items-center gap-4 cursor-pointer hover:border-yellow-500/40 transition-all">
                        <div class="bg-rose-500/10 p-4 rounded-xl text-rose-500 border border-rose-500/30">
                            <i data-lucide="zap" class="w-8 h-8"></i>
                        </div>
                        <div>
                            <h3 class="font-bold text-white">Rapid Tap Challenge</h3>
                            <p class="text-xs text-gray-400 mt-0.5">Tap the screen as fast as possible in 15s</p>
                        </div>
                    </div>
                </div>

                <!-- Game Portal Overlay Target Frame -->
                <div id="game-portal" class="fixed inset-0 bg-gray-950 z-50 hidden flex flex-col p-4 max-w-md mx-auto"></div>
            `;
        }
    },
    referral: {
        render: () => {
            const inviteLink = `https://t.me/RewardVerse_Bot/app?startapp=${state.user.telegram_id}`;
            return `
                <div class="mb-6">
                    <h2 class="text-2xl font-bold mb-1">Referral Network</h2>
                    <p class="text-xs text-gray-400">Expand your downline network to earn permanent referral bonuses</p>
                </div>

                <div class="glass-panel p-5 mb-6 text-center">
                    <i data-lucide="users" class="w-12 h-12 text-yellow-500 mx-auto mb-3"></i>
                    <h3 class="text-lg font-bold">Earn +400 Coins</h3>
                    <p class="text-xs text-gray-400 mt-1 max-w-xs mx-auto">Get credited instantly when a user joins and completes their first system mission</p>
                </div>

                <div class="glass-panel p-4 mb-6">
                    <label class="text-xs text-gray-400 block mb-2 font-bold">Your Unique Invite Link</label>
                    <div class="flex gap-2">
                        <input type="text" readonly value="${inviteLink}" class="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-xs font-mono text-gray-300 flex-grow select-all">
                        <button onclick="copyToClipboard('${inviteLink}')" class="bg-yellow-500 hover:bg-yellow-400 text-gray-950 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1">
                            <i data-lucide="copy" class="w-4 h-4"></i> Copy
                        </button>
                    </div>
                </div>

                <button onclick="shareInviteLink('${inviteLink}')" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2">
                    <i data-lucide="send" class="w-5 h-5"></i> Share on Telegram
                </button>
            `;
        }
    },
    wallet: {
        render: () => {
            const user = state.user;
            return `
                <div class="mb-6">
                    <h2 class="text-2xl font-bold mb-1">Central Wallet</h2>
                    <p class="text-xs text-gray-400">Withdraw earned tokens to local payment platforms and crypto</p>
                </div>

                <div class="glass-panel p-6 mb-6 text-center bg-gradient-to-b from-gray-900/60 to-gray-950/60">
                    <span class="text-xs text-gray-400 font-bold uppercase tracking-widest">Available Balance</span>
                    <h1 class="text-4xl font-black text-white mt-2 flex items-center justify-center gap-2">
                        <i data-lucide="coins" class="w-8 h-8 text-yellow-500"></i> ${parseFloat(user.current_coins).toLocaleString()}
                    </h1>
                    <p class="text-xs text-gray-400 mt-2">10,000 Coins = 5 BDT (Conversion Rate Index)</p>
                </div>

                <div class="glass-panel p-5 mb-6">
                    <h3 class="font-bold text-sm mb-4">Request Withdrawal</h3>
                    <div class="space-y-4">
                        <div>
                            <label class="text-xs text-gray-400 block mb-1">Target Method</label>
                            <select id="wd-method" class="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-sm text-gray-300">
                                <option value="bKash">bKash (BD Personal)</option>
                                <option value="Nagad">Nagad (BD Personal)</option>
                                <option value="USDT TRC20">USDT (TRC20 Wallet)</option>
                            </select>
                        </div>
                        <div>
                            <label class="text-xs text-gray-400 block mb-1">Wallet Address / Account Number</label>
                            <input type="text" id="wd-address" placeholder="e.g., +8801700000000" class="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-sm text-gray-300 font-mono">
                        </div>
                        <div>
                            <label class="text-xs text-gray-400 block mb-1">Coins Amount to Exchange</label>
                            <input type="number" id="wd-amount" oninput="calculateExchangedPreview(this.value)" placeholder="Minimum 2,000" class="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-sm text-gray-300 font-mono">
                        </div>
                        <div id="wd-preview" class="text-xs text-yellow-500 font-bold hidden">
                            Estimated Settlement Output: 0.00 BDT
                        </div>
                        <button onclick="submitWithdrawRequest()" class="w-full bg-yellow-500 hover:bg-yellow-400 text-gray-950 font-bold py-3 rounded-xl transition-all">
                            Process Payout Request
                        </button>
                    </div>
                </div>
            `;
        }
    }
};

/**
 * Handle Real-Time Input conversion previews inside Wallet view
 */
window.calculateExchangedPreview = function(val) {
    const preview = document.getElementById("wd-preview");
    if (!val || isNaN(val) || val < 0) {
        preview.classList.add("hidden");
        return;
    }
    const bdtAmount = (val / 10000) * 5;
    preview.innerText = `Estimated Settlement Output: ৳ ${bdtAmount.toFixed(2)} BDT`;
    preview.classList.remove("hidden");
};

/**
 * Trigger Claim Logic inside Daily Check-In Dashboard Component
 */
window.claimDailyStreak = async function() {
    if (state.isCheckingIn) return;
    state.isCheckingIn = true;

    const res = await requestAPI("/api/rewards/daily-checkin", "POST");
    state.isCheckingIn = false;

    if (res && res.success) {
        state.user = res.user;
        await dbService.set("user", res.user);
        showToast(`Day Streak claimed! +${res.earnedCoins} Coins!`, "success");
        navigate(state.current_tab);
    }
};

/**
 * Interactive Game Setup: lucky_spin
 */
window.initLuckySpin = function() {
    const portal = document.getElementById("game-portal");
    portal.classList.remove("hidden");
    portal.innerHTML = `
        <div class="flex items-center justify-between mb-4 border-b border-gray-800 pb-3">
            <h3 class="font-bold text-lg text-white">Lucky Wheel Spinner</h3>
            <button onclick="closeGamePortal()" class="text-gray-400 hover:text-white"><i data-lucide="x" class="w-6 h-6"></i></button>
        </div>
        <div class="flex-grow flex flex-col items-center justify-center gap-6">
            <div class="spin-container">
                <div class="spin-pointer"></div>
                <canvas id="wheel-canvas" width="280" height="280"></canvas>
            </div>
            <button id="spin-btn" onclick="executeSpinAnimation()" class="bg-yellow-500 hover:bg-yellow-400 text-gray-950 font-bold px-8 py-3 rounded-full transition-transform">
                Spin Wheel (50 Coins)
            </button>
        </div>
    `;
    lucide.createIcons();
    drawWheelCanvas(0);
};

const wheelSegments = ["Try Again", "150 Coins", "70 Coins", "Bonus Multi", "120 Coins", "50 Coins", "90 Coins", "100 Coins"];
const segmentColors = ["#1f2937", "#b45309", "#111827", "#854d0e", "#1f2937", "#b45309", "#111827", "#854d0e"];

function drawWheelCanvas(currentRotationAngle) {
    const canvas = document.getElementById("wheel-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const numSegments = wheelSegments.length;
    const arcSize = (2 * Math.PI) / numSegments;

    ctx.clearRect(0, 0, 280, 280);
    ctx.save();
    ctx.translate(140, 140);
    ctx.rotate(currentRotationAngle);

    for (let i = 0; i < numSegments; i++) {
        const startAngle = i * arcSize;
        const endAngle = startAngle + arcSize;

        ctx.beginPath();
        ctx.fillStyle = segmentColors[i];
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, 130, startAngle, endAngle);
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.stroke();

        ctx.save();
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 10px sans-serif";
        ctx.textAlign = "right";
        ctx.translate(Math.cos(startAngle + arcSize / 2) * 90, Math.sin(startAngle + arcSize / 2) * 90);
        ctx.rotate(startAngle + arcSize / 2 + Math.PI);
        ctx.fillText(wheelSegments[i], 0, 3);
        ctx.restore();
    }
    ctx.restore();

    // Outermost decorative border line
    ctx.beginPath();
    ctx.arc(140, 140, 134, 0, 2 * Math.PI);
    ctx.strokeStyle = "rgba(234, 179, 8, 0.4)";
    ctx.lineWidth = 4;
    ctx.stroke();
}

window.executeSpinAnimation = function() {
    const btn = document.getElementById("spin-btn");
    if (state.user.current_coins < 50) {
        showToast("Insufficient coin resources", "error");
        return;
    }

    btn.disabled = true;
    let rotation = 0;
    const segmentsCount = wheelSegments.length;
    const selectedSegmentIndex = Math.floor(Math.random() * segmentsCount);
    const stopAngle = (2 * Math.PI) - (selectedSegmentIndex * (2 * Math.PI / segmentsCount)) - (Math.PI / segmentsCount);
    const targetRotation = (2 * Math.PI * 6) + stopAngle; // spin 6 full rotations minimum

    let start = null;
    function animate(timestamp) {
        if (!start) start = timestamp;
        const progress = timestamp - start;
        const duration = 4000; // 4 seconds spin easing profile

        const t = Math.min(1, progress / duration);
        // Easing cubic deceleration formula curve
        const easeOut = 1 - Math.pow(1 - t, 3);
        rotation = easeOut * targetRotation;

        drawWheelCanvas(rotation);

        if (progress < duration) {
            requestAnimationFrame(animate);
        } else {
            resolveSpinResult(selectedSegmentIndex);
        }
    }
    requestAnimationFrame(animate);
};

async function resolveSpinResult(index) {
    const segment = wheelSegments[index];
    let earnedCoins = 0;
    let xpEarned = 5;

    if (segment.includes("Coins")) {
        earnedCoins = parseInt(segment);
    } else if (segment.includes("Bonus")) {
        earnedCoins = 200;
        xpEarned = 25;
    }

    // Deduct entry fee locally and award result
    state.user.current_coins -= 50;

    const res = await requestAPI("/api/games/complete", "POST", {
        gameId: "spin_wheel",
        rewardCoins: earnedCoins,
        xpEarned
    });

    if (res && res.success) {
        state.user = res.user;
        await dbService.set("user", res.user);
        showToast(`Result: ${segment}! balance updated.`, earnedCoins > 0 ? "success" : "error");
    }
    
    const btn = document.getElementById("spin-btn");
    if (btn) btn.disabled = false;
    navigate(state.current_tab);
}

/**
 * Interactive Game Setup: number_guess
 */
let targetSecretNum = 0;
let guessTriesCount = 0;

window.initNumberGuess = function() {
    targetSecretNum = Math.floor(Math.random() * 100) + 1;
    guessTriesCount = 0;

    const portal = document.getElementById("game-portal");
    portal.classList.remove("hidden");
    portal.innerHTML = `
        <div class="flex items-center justify-between mb-4 border-b border-gray-800 pb-3">
            <h3 class="font-bold text-lg text-white">Number Guessing</h3>
            <button onclick="closeGamePortal()" class="text-gray-400 hover:text-white"><i data-lucide="x" class="w-6 h-6"></i></button>
        </div>
        <div class="flex-grow flex flex-col justify-center max-w-xs mx-auto text-center gap-4">
            <p class="text-xs text-gray-400">Guess the secret integer boundary between 1 and 100. Lower guesses scale down reward metrics.</p>
            <div id="guess-hint" class="bg-gray-900 border border-gray-800 p-4 rounded-xl text-yellow-500 font-bold min-h-[50px] flex items-center justify-center">
                Enter your initial target guess
            </div>
            <input type="number" id="guess-input" placeholder="Guess 1-100" class="w-full bg-gray-900 border border-gray-800 text-center text-xl font-bold p-3 rounded-xl text-white">
            <button onclick="evaluateNumberGuess()" class="w-full bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-bold py-3.5 rounded-xl transition-all">
                Submit Guess
            </button>
        </div>
    `;
    lucide.createIcons();
};

window.evaluateNumberGuess = async function() {
    const input = document.getElementById("guess-input");
    const hint = document.getElementById("guess-hint");
    const guessVal = parseInt(input.value);

    if (isNaN(guessVal) || guessVal < 1 || guessVal > 100) {
        showToast("Range boundary limit deviation", "error");
        return;
    }

    guessTriesCount++;
    if (guessVal === targetSecretNum) {
        const calculatedReward = Math.max(10, 100 - (guessTriesCount * 10));
        hint.innerText = `Correct! Secret was ${targetSecretNum}. Claims +${calculatedReward} Coins!`;
        
        const res = await requestAPI("/api/games/complete", "POST", {
            gameId: "guess_number",
            rewardCoins: calculatedReward,
            xpEarned: 15
        });

        if (res && res.success) {
            state.user = res.user;
            await dbService.set("user", res.user);
            showToast(`Correct Guess! +${calculatedReward} Coins.`, "success");
        }
        setTimeout(() => closeGamePortal(), 2500);
    } else if (guessVal < targetSecretNum) {
        hint.innerText = `Too Low! Attempts made: ${guessTriesCount}`;
    } else {
        hint.innerText = `Too High! Attempts made: ${guessTriesCount}`;
    }
    input.value = "";
};

/**
 * Interactive Game Setup: memory_match
 */
let firstSelectedCard = null;
let secondSelectedCard = null;
let matchesCompleted = 0;
let isWaitingTurn = false;
let memoryTimer = null;
let timeElapsed = 0;

window.initMemoryMatch = function() {
    const portal = document.getElementById("game-portal");
    portal.classList.remove("hidden");
    portal.innerHTML = `
        <div class="flex items-center justify-between mb-4 border-b border-gray-800 pb-3">
            <h3 class="font-bold text-lg text-white">Card Memory Match</h3>
            <button onclick="closeGamePortal()" class="text-gray-400 hover:text-white"><i data-lucide="x" class="w-6 h-6"></i></button>
        </div>
        <div class="flex-grow flex flex-col justify-between">
            <div class="flex justify-between items-center text-xs text-gray-400 px-1">
                <span id="mem-timer">Timer: 0s</span>
                <span id="mem-matches">Matches: 0/8</span>
            </div>
            <div class="grid grid-cols-4 gap-2.5 my-auto" id="mem-grid"></div>
            <div class="h-2"></div>
        </div>
    `;
    lucide.createIcons();
    bootstrapMemoryGrid();
};

const cardIconsList = ["coins", "zap", "award", "users", "wallet", "gamepad-2", "calendar", "help-circle"];

function bootstrapMemoryGrid() {
    const grid = document.getElementById("mem-grid");
    matchesCompleted = 0;
    timeElapsed = 0;
    isWaitingTurn = false;
    firstSelectedCard = null;
    secondSelectedCard = null;

    clearInterval(memoryTimer);
    memoryTimer = setInterval(() => {
        timeElapsed++;
        const timerEl = document.getElementById("mem-timer");
        if (timerEl) timerEl.innerText = `Timer: ${timeElapsed}s`;
    }, 1000);

    // Shuffle card pool configurations
    let doubledPairs = [...cardIconsList, ...cardIconsList]
        .map((icon, id) => ({ id, icon, active: false }))
        .sort(() => Math.random() - 0.5);

    grid.innerHTML = doubledPairs.map(card => `
        <div class="card-flip aspect-square cursor-pointer" onclick="handleCardClick(this, ${card.id}, '${card.icon}')">
            <div class="card-inner w-full h-full relative rounded-xl transition-all duration-300 transform">
                <div class="card-front w-full h-full bg-gray-900 border border-gray-800 rounded-xl flex items-center justify-center">
                    <span class="text-xs font-bold text-gray-600">RV</span>
                </div>
                <div class="card-back w-full h-full bg-yellow-500 border border-yellow-400 rounded-xl flex items-center justify-center text-gray-950">
                    <i data-lucide="${card.icon}" class="w-6 h-6"></i>
                </div>
            </div>
        </div>
    `).join("");
    lucide.createIcons();
}

window.handleCardClick = function(elem, cardId, icon) {
    if (isWaitingTurn || elem.classList.contains("card-flipped") || elem.classList.contains("matched")) return;

    elem.classList.add("card-flipped");

    if (!firstSelectedCard) {
        firstSelectedCard = { elem, cardId, icon };
    } else {
        secondSelectedCard = { elem, cardId, icon };
        evaluateCardPair();
    }
};

function evaluateCardPair() {
    isWaitingTurn = true;
    if (firstSelectedCard.icon === secondSelectedCard.icon) {
        firstSelectedCard.elem.classList.add("matched");
        secondSelectedCard.elem.classList.add("matched");
        matchesCompleted++;

        document.getElementById("mem-matches").innerText = `Matches: ${matchesCompleted}/8`;
        resetSelections();

        if (matchesCompleted === 8) {
            concludeMemoryGame();
        }
    } else {
        setTimeout(() => {
            firstSelectedCard.elem.classList.remove("card-flipped");
            secondSelectedCard.elem.classList.remove("card-flipped");
            resetSelections();
        }, 1000);
    }
}

function resetSelections() {
    firstSelectedCard = null;
    secondSelectedCard = null;
    isWaitingTurn = false;
}

async function concludeMemoryGame() {
    clearInterval(memoryTimer);
    // Dynamic Speed bonus factor calculations
    const reward = Math.max(10, 150 - timeElapsed);
    
    const res = await requestAPI("/api/games/complete", "POST", {
        gameId: "memory_match",
        rewardCoins: reward,
        xpEarned: 30
    });

    if (res && res.success) {
        state.user = res.user;
        await dbService.set("user", res.user);
        showToast(`Memory match finalized! +${reward} Coins.`, "success");
    }
    setTimeout(() => closeGamePortal(), 2000);
}

/**
 * Interactive Game Setup: tap_speed
 */
let tapPointsScore = 0;
let remainingChallengeSeconds = 15;
let tapIntervalTimer = null;

window.initTapSpeedChallenge = function() {
    tapPointsScore = 0;
    remainingChallengeSeconds = 15;

    const portal = document.getElementById("game-portal");
    portal.classList.remove("hidden");
    portal.innerHTML = `
        <div class="flex items-center justify-between mb-4 border-b border-gray-800 pb-3">
            <h3 class="font-bold text-lg text-white">Rapid Tap Challenge</h3>
            <button onclick="closeGamePortal()" class="text-gray-400 hover:text-white"><i data-lucide="x" class="w-6 h-6"></i></button>
        </div>
        <div class="flex-grow flex flex-col justify-between items-center text-center">
            <div class="flex justify-between w-full max-w-xs text-xs text-gray-400">
                <span id="tap-timer">Time Left: 15s</span>
                <span id="tap-score">Taps Count: 0</span>
            </div>
            <div id="tap-target" onclick="registerChallengeTap()" class="w-48 h-48 rounded-full bg-gradient-to-tr from-rose-600 to-pink-500 border border-rose-400 shadow-lg flex items-center justify-center font-black text-2xl cursor-pointer select-none active:scale-95 transition-transform">
                TAP ME!
            </div>
            <p class="text-[10px] text-gray-400 mb-2">Each registered tap counts towards final coin evaluation index multiplier calculations</p>
        </div>
    `;
    lucide.createIcons();

    clearInterval(tapIntervalTimer);
    tapIntervalTimer = setInterval(() => {
        remainingChallengeSeconds--;
        const timerEl = document.getElementById("tap-timer");
        if (timerEl) timerEl.innerText = `Time Left: ${remainingChallengeSeconds}s`;

        if (remainingChallengeSeconds <= 0) {
            concludeTapChallenge();
        }
    }, 1000);
};

window.registerChallengeTap = function() {
    if (remainingChallengeSeconds <= 0) return;
    tapPointsScore++;
    document.getElementById("tap-score").innerText = `Taps Count: ${tapPointsScore}`;
};

async function concludeTapChallenge() {
    clearInterval(tapIntervalTimer);
    const rewardCoins = Math.min(100, tapPointsScore * 2);

    const res = await requestAPI("/api/games/complete", "POST", {
        gameId: "tap_challenge",
        rewardCoins,
        xpEarned: 20
    });

    if (res && res.success) {
        state.user = res.user;
        await dbService.set("user", res.user);
        showToast(`Challenge Done! +${rewardCoins} Coins.`, "success");
    }
    setTimeout(() => closeGamePortal(), 2000);
}

window.closeGamePortal = function() {
    clearInterval(memoryTimer);
    clearInterval(tapIntervalTimer);
    const portal = document.getElementById("game-portal");
    portal.classList.add("hidden");
    navigate(state.current_tab);
};

/**
 * Handle Verification Checks on dynamic Mission items
 */
window.handleVerifyMission = async function(missionId) {
    const res = await requestAPI("/api/missions/complete", "POST", { missionId });
    if (res && res.success) {
        state.user = res.user;
        await dbService.set("user", res.user);
        showToast(`Task Complete! Rewards successfully synchronized.`, "success");
        navigate(state.current_tab);
    }
};

/**
 * Trigger Wallet Cash Out submissions
 */
window.submitWithdrawRequest = async function() {
    const method = document.getElementById("wd-method").value;
    const walletAddress = document.getElementById("wd-address").value.trim();
    const amountCoins = parseInt(document.getElementById("wd-amount").value);

    if (!walletAddress || isNaN(amountCoins)) {
        showToast("Invalid payment details specified", "error");
        return;
    }

    const res = await requestAPI("/api/wallet/withdraw", "POST", { method, walletAddress, amountCoins });
    if (res && res.success) {
        state.user = res.user;
        await dbService.set("user", res.user);
        showToast("Withdrawal registered! Processing sequence initialized.", "success");
        navigate(state.current_tab);
    }
};

/**
 * Utility Copy Interface
 */
window.copyToClipboard = function(text) {
    navigator.clipboard.writeText(text);
    showToast("Invite link copied to clipboard device memory");
};

/**
 * Share Link interface through native Telegram webApp SDK overlays
 */
window.shareInviteLink = function(url) {
    if (tg && tg.openTelegramLink) {
        const text = encodeURIComponent("Join RewardVerse and earn real cash rewards by playing games!");
        tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${text}`);
    } else {
        window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}`, "_blank");
    }
};

/**
 * Setup and integrate AdsGram Monetization Engine callback events
 */
window.triggerRewardedAds = function() {
    const now = Date.now();
    // Enforce clientside ad cooldown logic (60 seconds)
    if (now - state.lastAdClaimed < 60000) {
        const remaining = Math.ceil((60000 - (now - state.lastAdClaimed)) / 1000);
        showToast(`Wait ${remaining} seconds before next Ad load call.`, "error");
        return;
    }

    if (window.Adsgram) {
        const controller = window.Adsgram.init({ blockId: DEFAULT_ADS_BLOCK_ID });
        controller.show()
            .then(async (result) => {
                if (result.done) {
                    const res = await requestAPI("/api/ads/claim", "POST");
                    if (res && res.success) {
                        state.user = res.user;
                        await dbService.set("user", res.user);
                        state.lastAdClaimed = Date.now();
                        showToast(`Ad complete! +${res.rewardCoins} Coins.`, "success");
                        navigate(state.current_tab);
                    }
                }
            })
            .catch((err) => {
                showToast(`Failed to load sponsored ad sequence: ${err.description || 'Unavailable'}`, "error");
            });
    } else {
        // Mock execution pattern during debugging environments
        showToast("AdsGram SDK not found. Simulating development execution rewards", "success");
        setTimeout(async () => {
            const res = await requestAPI("/api/ads/claim", "POST");
            if (res && res.success) {
                state.user = res.user;
                await dbService.set("user", res.user);
                state.lastAdClaimed = Date.now();
                showToast(`Mock Ad Complete: +25 Coins.`, "success");
                navigate(state.current_tab);
            }
        }, 1200);
    }
};

/**
 * Handle Single Page Views Transitions
 */
window.navigate = function(routeId) {
    const matchedRoute = routes[routeId] || routes.home;
    state.current_tab = routeId;

    const viewport = document.getElementById("view-content");
    viewport.style.opacity = "0";

    setTimeout(() => {
        viewport.innerHTML = matchedRoute.render();
        viewport.style.opacity = "1";
        
        // Handle Active states on Bottom Navigation Elements
        document.querySelectorAll(".nav-btn").forEach(btn => {
            btn.classList.toggle("active", btn.getAttribute("data-tab") === routeId);
        });

        // Instantiate rendering icons
        lucide.createIcons();
    }, 150);
};

// Handle routing based on location hash
window.addEventListener("hashchange", () => {
    const route = location.hash.replace("#/", "");
    navigate(route);
});

/**
 * Master App Startup Initializer
 */
async function appStartupSequence() {
    await dbService.init();
    
    // Load cached records prior to remote fetches
    const cachedUser = await dbService.get("user");
    if (cachedUser) {
        state.user = cachedUser;
    }

    // Attempt remote auth dynamic sync via WebApp initData
    const syncData = await requestAPI("/api/user/sync", "POST", {
        startParam: tg ? tg.initDataUnsafe?.start_param : null
    });

    if (syncData) {
        state.user = syncData;
        await dbService.set("user", syncData);
    }

    // Terminate splash screen layer
    const loader = document.getElementById("app-loader");
    if (loader) {
        loader.classList.add("opacity-0");
        setTimeout(() => loader.remove(), 400);
    }

    // Set initial route
    const initialRoute = location.hash.replace("#/", "") || "home";
    navigate(initialRoute);
}

// Trigger initial boot process
appStartupSequence();
