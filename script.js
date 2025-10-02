const config = {
    backgroundColor: '#000000',
    lineColor: '#ffffff',
    lineWidth: 2,
    gridSize: 7,
    noiseSeed: 'parallax-bw',
    noiseScale: 0.02,
    noiseEvolutionSpeed: 0.00067,
    noiseUpdateInterval: 2,
    numContourLevels: 14,
    contourInterval: 0.07,
    smoothingEnabled: true,
    smoothingIterations: 2,
    smoothingFactor: 0.5,
};

const volumeControlConfig = {
    enabled: true,
    placement: 'top-left', // 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
    showSlider: false,
    animate: true,
};

let canvas, ctx;
let cols, rows, field;
let time = 0, frameCount = 0, lastNoiseUpdate = 0;

const DISCORD_ID = '1412174644458557583';
const LANYARD_WS = `wss://api.lanyard.rest/socket`;
let discordStatus = 'offline';
let lanyardData = null;

const discordColors = {
    online: '#43b581',
    idle: '#faa61a',
    dnd: '#f04747',
    offline: '#747f8d',
};

function setupAvatarTooltip() {
    const avatar = document.getElementById('user-avatar');
    if (!avatar) return;
    let tooltip = document.createElement('div');
    tooltip.className = 'avatar-tooltip';
    tooltip.textContent = `ID: ${DISCORD_ID}`;
    Object.assign(tooltip.style, {
        position: 'absolute',
        left: '50%',
        top: '-40px',
        transform: 'translateX(-50%)',
        background: '#000000',
        color: '#fff',
        fontWeight: 'bold',
        padding: '6px 13px',
        borderRadius: '8px',
        fontSize: '0.97rem',
        whiteSpace: 'nowrap',
        border: '1px solid #333',
        boxShadow: '0 2px 12px #000',
        zIndex: 101,
        opacity: 0,
        pointerEvents: 'none',
        transition: 'opacity .25s',
    });
    avatar.parentElement.style.position = 'relative';
    avatar.parentElement.appendChild(tooltip);
    avatar.addEventListener('mouseenter', () => { tooltip.style.opacity = 1; });
    avatar.addEventListener('mouseleave', () => { tooltip.style.opacity = 0; });
}

function setAvatarBorder(status) {
    const avatar = document.getElementById('user-avatar');
    if (!avatar) return;
    avatar.style.boxShadow = `0 0 0 0px #000`;
    avatar.style.border = `2.5px solid #222`;
    let ring = avatar.parentElement.querySelector('.status-ring');
    if (!ring) {
        ring = document.createElement('div');
        ring.className = 'status-ring';
        Object.assign(ring.style, {
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%,-50%)',
            width: '118px',
            height: '118px',
            borderRadius: '50%',
            pointerEvents: 'none',
            zIndex: 9,
            border: `3px solid ${discordColors[status] || discordColors['offline']}`,
            boxSizing: 'border-box',
            transition: 'border-color .4s',
        });
        avatar.parentElement.appendChild(ring);
    } else {
        ring.style.borderColor = discordColors[status] || discordColors['offline'];
    }
}

function updateDiscordStatusText() {
    let statusEl = document.getElementById('discord-status-text');
    if (!statusEl) {
        statusEl = document.createElement('div');
        statusEl.id = 'discord-status-text';
        statusEl.className = 'discord-status';
        const username = document.getElementById('username');
        const badges = document.querySelector('.badges');
        if (username && badges && username.parentElement) {
            username.parentElement.appendChild(statusEl);
            
            requestAnimationFrame(() => {
                const usernameRect = username.getBoundingClientRect();
                const badgesRect = badges.getBoundingClientRect();
                const midPoint = (usernameRect.bottom + badgesRect.top) / 2;
                const cardRect = username.parentElement.getBoundingClientRect();
                statusEl.style.top = `${midPoint - cardRect.top}px`;
            });
        }
    }

    if (!lanyardData) {
        statusEl.textContent = '';
        statusEl.style.display = 'none';
        return;
    }

    const spotify = lanyardData.spotify;
    if (spotify && spotify.song && spotify.artist) {
        const artists = spotify.artist.includes(';') 
            ? spotify.artist.split(';').map(artist => artist.trim()).join(' and ')
            : spotify.artist;
        
        const fullText = `♫ Listening to ${spotify.song} by ${artists}`;
        const lineBreak = fullText.length > 50 ? '<br>' : ' ';
        
        statusEl.innerHTML = `<span style="color: #1DB954;">♫</span> Listening to <strong>${spotify.song}</strong>${lineBreak}by <strong>${artists}</strong>`;
        statusEl.style.display = 'block';
        return;
    }

    const status = discordStatus || 'offline';
    const statusLabels = {
        online: 'Online',
        idle: 'Idle',
        dnd: 'DND',
        offline: 'Offline'
    };
    const statusColor = discordColors[status] || discordColors['offline'];
    const label = statusLabels[status] || 'Offline';
    statusEl.innerHTML = `<span style="color: ${statusColor};">●</span> ${label}`;
    statusEl.style.display = 'block';
}

function connectLanyard() {
    let ws = new WebSocket(LANYARD_WS);
    ws.addEventListener('open', () => {
        ws.send(JSON.stringify({
            op: 2,
            d: { subscribe_to_id: DISCORD_ID }
        }));
    });
    ws.addEventListener('message', (e) => {
        let data = JSON.parse(e.data);
        if (!data || !data.t || !data.d) return;
        if (data.t === 'INIT_STATE' || data.t === 'PRESENCE_UPDATE') {
            let status = data.d.discord_status || 'offline';
            discordStatus = status;
            lanyardData = data.d;
            setAvatarBorder(status);
            updateDiscordStatusText();
        }
    });
    ws.addEventListener('close', () => {
        setTimeout(connectLanyard, 3000);
    });
}

const noise = (function() {
    let p = [];
    function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    function lerp(t, a, b) { return a + t * (b - a); }
    function grad(hash, x, y, z) {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }
    function setSeed(seed) {
        const random = (() => {
            let s = [];
            let key = [] + seed;
            for (let i = 0; i < 256; i++) s[i] = i;
            for (let i = 255; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [s[i], s[j]] = [s[j], s[i]];
            }
            let p = [];
            for (let i = 0; i < 512; i++) p[i] = s[i & 255];
            return p;
        })();
        p = random;
    }
    function generate(x, y = 0, z = 0) {
        const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
        x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
        const u = fade(x), v = fade(y), w = fade(z);
        const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z, B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
        return lerp(w, lerp(v, lerp(u, grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z)), lerp(u, grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z))), lerp(v, lerp(u, grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1)), lerp(u, grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1))));
    }
    setSeed(config.noiseSeed);
    return { generate, setSeed };
})();

function setupCanvas() {
    canvas = document.getElementById('topo-canvas');
    ctx = canvas.getContext('2d');
    setupTopo();
}

function setupTopo() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    cols = Math.floor(canvas.width / config.gridSize);
    rows = Math.floor(canvas.height / config.gridSize);
    field = Array.from({length: cols}, () => Array(rows));
    ctx.fillStyle = config.backgroundColor;
    ctx.strokeStyle = config.lineColor;
    ctx.lineWidth = config.lineWidth;
}

function updateField() {
    if (frameCount - lastNoiseUpdate < 2) return;
    lastNoiseUpdate = frameCount;
    for (let x = 0; x < cols; x++) {
        for (let y = 0; y < rows; y++) {
            field[x][y] = (noise.generate(x * config.noiseScale, y * config.noiseScale, time) + 1) / 2;
        }
    }
}

function drawTopo() {
    frameCount++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    updateField();
    for (let i = 0; i < config.numContourLevels; i++) {
        const threshold = i * config.contourInterval;
        ctx.beginPath();
        for (let x = 0; x < cols - 1; x++) {
            for (let y = 0; y < rows - 1; y++) {
                const v1 = field[x][y], v2 = field[x + 1][y], v3 = field[x + 1][y + 1], v4 = field[x][y + 1];
                let state = 0;
                if (v1 > threshold) state |= 8;
                if (v2 > threshold) state |= 4;
                if (v3 > threshold) state |= 2;
                if (v4 > threshold) state |= 1;
                if (state === 0 || state === 15) continue;
                const cellX = x * config.gridSize;
                const cellY = y * config.gridSize;
                const pt1 = { x: cellX, y: cellY }, pt2 = { x: cellX + config.gridSize, y: cellY }, pt3 = { x: cellX + config.gridSize, y: cellY + config.gridSize }, pt4 = { x: cellX, y: cellY + config.gridSize };
                const interpolate = (pA, pB, valA, valB) => {
                    if (Math.abs(valA - valB) < 1e-6) return pA;
                    const mu = (threshold - valA) / (valB - valA);
                    return { x: pA.x + mu * (pB.x - pA.x), y: pA.y + mu * (pB.y - pA.y) };
                };
                const segments = [];
                switch (state) {
                    case 1:  segments.push(interpolate(pt4, pt1, v4, v1), interpolate(pt4, pt3, v4, v3)); break;
                    case 2:  segments.push(interpolate(pt3, pt2, v3, v2), interpolate(pt3, pt4, v3, v4)); break;
                    case 3:  segments.push(interpolate(pt4, pt1, v4, v1), interpolate(pt3, pt2, v3, v2)); break;
                    case 4:  segments.push(interpolate(pt2, pt1, v2, v1), interpolate(pt2, pt3, v2, v3)); break;
                    case 5:  segments.push(interpolate(pt4, pt1, v4, v1), interpolate(pt2, pt1, v2, v1));
                             segments.push(interpolate(pt4, pt3, v4, v3), interpolate(pt2, pt3, v2, v3)); break;
                    case 6:  segments.push(interpolate(pt2, pt1, v2, v1), interpolate(pt3, pt4, v3, v4)); break;
                    case 7:  segments.push(interpolate(pt4, pt1, v4, v1), interpolate(pt2, pt1, v2, v1)); break;
                    case 8:  segments.push(interpolate(pt1, pt2, v1, v2), interpolate(pt1, pt4, v1, v4)); break;
                    case 9:  segments.push(interpolate(pt1, pt2, v1, v2), interpolate(pt3, pt4, v3, v4)); break;
                    case 10: segments.push(interpolate(pt1, pt4, v1, v4), interpolate(pt3, pt4, v3, v4));
                             segments.push(interpolate(pt1, pt2, v1, v2), interpolate(pt3, pt2, v3, v2)); break;
                    case 11: segments.push(interpolate(pt1, pt2, v1, v2), interpolate(pt3, pt2, v3, v2)); break;
                    case 12: segments.push(interpolate(pt1, pt4, v1, v4), interpolate(pt2, pt3, v2, v3)); break;
                    case 13: segments.push(interpolate(pt2, pt3, v2, v3), interpolate(pt4, pt3, v4, v3)); break;
                    case 14: segments.push(interpolate(pt1, pt4, v1, v4), interpolate(pt3, pt4, v3, v4)); break;
                }
                for (let j = 0; j < segments.length; j += 2) {
                    let path = [segments[j], segments[j + 1]];
                    ctx.moveTo(path[0].x, path[0].y);
                    for (let k = 1; k < path.length; k++) ctx.lineTo(path[k].x, path[k].y);
                }
            }
        }
        ctx.stroke();
    }
    time += config.noiseEvolutionSpeed;
    requestAnimationFrame(drawTopo);
}

function setupTitleTyping() {
    const full = '@parallax';
    const base = '@';
    let i = 0;
    let forward = true;
    let timer;
    const titleEl = document.getElementById('animated-title');

    function setTitle(text) {
        document.title = text;
        if (titleEl) titleEl.textContent = text;
    }

    function step() {
        if (forward) {
            i++;
            setTitle(full.slice(0, i));
            if (i < full.length) {
                timer = setTimeout(step, 200);
            } else {
                forward = false;
                timer = setTimeout(step, 1000);
            }
        } else {
            i--;
            setTitle(full.slice(0, i) || base);
            if (i > 0) {
                timer = setTimeout(step, 90);
            } else {
                forward = true;
                setTitle(base);
                timer = setTimeout(step, 700);
            }
        }
    }

    setTitle(base);
    step();

    return { stop: () => clearTimeout(timer) };
}


function handleOverlay() {
    const overlay = document.getElementById('enter-overlay');
    const mainContent = document.getElementById('main-content');

    overlay.style.display = 'flex';
    mainContent.classList.add('hidden');

    let hasEntered = false;
    function enterSite() {
        if (hasEntered) return;
        hasEntered = true;
        document.removeEventListener('click', enterSite);
        document.removeEventListener('keydown', handleKeyPress);

        overlay.classList.add('hidden');

        overlay.addEventListener('transitionend', () => {
            overlay.style.display = 'none';
            mainContent.classList.remove('hidden');
            if (window.__musicReveal) window.__musicReveal();
        }, { once: true });
    }

    function handleKeyPress() { enterSite(); }

    document.addEventListener('click', enterSite, { once: true });
    document.addEventListener('keydown', handleKeyPress, { once: true });
}

function setupSocialLinks() {
    const discordElem = document.querySelector('.social-link.discord');
    if (discordElem) {
        discordElem.href = 'https://discord.com/users/1412174644458557583';
        discordElem.target = '_blank';
        discordElem.rel = 'noopener noreferrer';
    }
    const githubElem = document.querySelector('.social-link.github');
    if (githubElem) {
        githubElem.href = 'https://github.com/paral-lax';
        githubElem.target = '_blank';
        githubElem.rel = 'noopener noreferrer';
        const githubSVG = githubElem.querySelector('svg');
        if (githubSVG) {
            githubSVG.style.width = "44px";
            githubSVG.style.height = "44px";
        }
    }
    const litecoinElem = document.querySelector('.social-link.litecoin');
    if (litecoinElem) {
        litecoinElem.addEventListener('click', function(e) {
            e.preventDefault();
            const address = "Lff4hzFG7GSm4jPogS5J2chx3Dd1Ufgr9X";
            navigator.clipboard.writeText(address);
            litecoinElem.setAttribute('data-tooltip', 'address copied');
            setTimeout(() => {
                litecoinElem.setAttribute('data-tooltip', 'Litecoin');
            }, 1200);
        });
        litecoinElem.href = "#";
    }
}

function setupResizeHandlers() {
    window.addEventListener('resize', () => {
        setupTopo();
    });
    window.addEventListener('orientationchange', () => {
        setupTopo();
    });
}

function setupBoldTooltips() {
    const style = document.createElement('style');
    style.textContent = `
        .card-views[data-tooltip]::after,
        .badge[data-tooltip]::after,
        .social-link[data-tooltip]::before {
            font-weight: bold !important;
        }
        .avatar-tooltip {
            font-weight: bold !important;
        }
    `;
    document.head.appendChild(style);
}

function setupCardTilt() {
    const card = document.querySelector('.profile-card');
    if (!card) return;

    card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        const mouseX = e.clientX - centerX;
        const mouseY = e.clientY - centerY;
        
        const rotateX = (mouseY / rect.height) * -20;
        const rotateY = (mouseX / rect.width) * 20;
        
        card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(10px)`;
    });

    card.addEventListener('mouseleave', () => {
        card.style.transform = 'rotateX(0deg) rotateY(0deg) translateZ(0px)';
    });
}

let __vc = {
    el: null,
    btn: null,
    slider: null,
    lastNonZero: 67,
};

function renderVolumeSVG(level, muted) {
    const waves = muted || level === 0 ? 0 : level >= 50 ? 3 : level >= 30 ? 2 : 1;
    return `
    <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" stroke="none" aria-hidden="true">
        <path d="M3 9v6h4l5 5V4L7 9H3z" fill="#fff"></path>
        ${waves >= 1 ? '<path d="M14.5 12a2.5 2.5 0 0 0-1.5-2.3V14.3a2.5 2.5 0 0 0 1.5-2.3z" fill="#fff"></path>' : ''}
        ${waves >= 2 ? '<path d="M16 7.2a6 6 0 0 1 0 9.6V18a7.5 7.5 0 0 0 0-12v1.2z" fill="#fff"></path>' : ''}
        ${waves >= 3 ? '<path d="M18 5a9 9 0 0 1 0 14v1.5a10.5 10.5 0 0 0 0-17V5z" fill="#fff"></path>' : ''}
    </svg>`;
}

function getProfileCardWidth() {
    const card = document.querySelector('.profile-card');
    if (!card) return 360;
    const rect = card.getBoundingClientRect();
    return Math.round(card.offsetWidth || rect.width);
}

function positionVolumeCard() {
    if (!__vc.el) return;
    const p = volumeControlConfig.placement;

    __vc.el.classList.remove('vc-top-right','vc-top-left','vc-bottom-right','vc-bottom-left');
    __vc.el.style.position = 'fixed';
    __vc.el.style.right = __vc.el.style.left = __vc.el.style.top = __vc.el.style.bottom = '';

    if (!volumeControlConfig.showSlider) {
        __vc.el.style.width = '56px';
        __vc.el.style.height = '56px';
        const margin = 24;
        switch (p) {
            case 'top-left':
                __vc.el.style.top = margin + 'px';
                __vc.el.style.left = margin + 'px';
                break;
            case 'top-right':
                __vc.el.style.top = margin + 'px';
                __vc.el.style.right = margin + 'px';
                break;
            case 'bottom-left':
                __vc.el.style.bottom = margin + 'px';
                __vc.el.style.left = margin + 'px';
                break;
            case 'bottom-right':
            default:
                __vc.el.style.bottom = margin + 'px';
                __vc.el.style.right = margin + 'px';
                break;
        }
    } else {
        const w = getProfileCardWidth();
        __vc.el.style.width = w + 'px';
        const margin = 24;
        switch (p) {
            case 'top-left':
                __vc.el.classList.add('vc-top-left');
                __vc.el.style.top = margin + 'px';
                __vc.el.style.left = margin + 'px';
                break;
            case 'top-right':
                __vc.el.classList.add('vc-top-right');
                __vc.el.style.top = margin + 'px';
                __vc.el.style.right = margin + 'px';
                break;
            case 'bottom-left':
                __vc.el.classList.add('vc-bottom-left');
                __vc.el.style.bottom = margin + 'px';
                __vc.el.style.left = margin + 'px';
                break;
            case 'bottom-right':
            default:
                __vc.el.classList.add('vc-bottom-right');
                __vc.el.style.bottom = margin + 'px';
                __vc.el.style.right = margin + 'px';
                break;
        }
    }

    if (__vc.el.parentElement !== document.body) {
        document.body.appendChild(__vc.el);
    }

    const dirLeft = (p === 'top-right' || p === 'bottom-right');
    __vc.el.classList.toggle('vc-dir-left', dirLeft);
    __vc.el.classList.toggle('vc-dir-right', !dirLeft);
}

function updateVolumeIconUI() {
    if (!__vc.btn) return;
    const vol = Math.round((backgroundMusic?.volume ?? 0.67) * 100);
    const isMuted = backgroundMusic?.muted || vol === 0;
    __vc.btn.innerHTML = renderVolumeSVG(vol, !!isMuted);
    __vc.btn.setAttribute('aria-pressed', isMuted ? 'true' : 'false');
}

function setupVolumeControl() {
    if (!volumeControlConfig.enabled) return;

    const btn = document.createElement('button');
    btn.className = 'vc-button';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Toggle mute');

    let card, inner, sliderWrap, slider;

    if (!volumeControlConfig.showSlider) {
        btn.style.opacity = '0';
        btn.style.pointerEvents = 'none';
        btn.style.position = 'fixed';
        btn.style.zIndex = '4000';
        document.body.appendChild(btn);
        __vc.el = btn;
        __vc.btn = btn;
        __vc.slider = null;
    } else {
        card = document.createElement('div');
        card.className = 'volume-card';
        inner = document.createElement('div');
        inner.className = 'vc-inner';

        sliderWrap = document.createElement('div');
        sliderWrap.className = 'vc-slider-wrap';
        slider = document.createElement('input');
        slider.className = 'vc-slider';
        slider.type = 'range';
        slider.min = '0';
        slider.max = '100';
        slider.step = '1';

        const initialVol = Math.round((backgroundMusic?.volume ?? 0.67) * 100);
        slider.value = String(initialVol);
        __vc.lastNonZero = initialVol > 0 ? initialVol : 67;

        slider.style.setProperty('--value', slider.value + '%');

        sliderWrap.appendChild(slider);
        inner.appendChild(btn);
        inner.appendChild(sliderWrap);
        card.appendChild(inner);

        card.classList.toggle('vc-animated', !!volumeControlConfig.animate);
        card.style.opacity = '0';
        card.style.pointerEvents = 'none';
        document.body.appendChild(card);

        __vc.el = card;
        __vc.btn = btn;
        __vc.slider = slider;
    }

    const initialVol = Math.round((backgroundMusic?.volume ?? 0.67) * 100);
    __vc.lastNonZero = initialVol > 0 ? initialVol : 67;

    btn.addEventListener('click', () => {
        const audio = backgroundMusic;
        if (!audio) return;
        const volNow = Math.round(audio.volume * 100);
        if (audio.muted || volNow === 0) {
            const v = __vc.lastNonZero > 0 ? __vc.lastNonZero : 67;
            audio.muted = false;
            audio.volume = Math.min(1, Math.max(0, v / 100));
            if (__vc.slider) {
                __vc.slider.value = String(v);
                __vc.slider.style.setProperty('--value', v + '%');
            }
        } else {
            __vc.lastNonZero = volNow;
            audio.volume = 0;
            if (__vc.slider) {
                __vc.slider.value = '0';
                __vc.slider.style.setProperty('--value', '0%');
            }
        }
        updateVolumeIconUI();
    });

    if (__vc.slider) {
        const updateSliderFill = () => {
            __vc.slider.style.setProperty('--value', __vc.slider.value + '%');
        };

        const onInput = () => {
            const audio = backgroundMusic;
            if (!audio) return;
            const v = parseInt(slider.value || '0', 10);
            audio.muted = false;
            audio.volume = Math.min(1, Math.max(0, v / 100));
            if (v > 0) __vc.lastNonZero = v;
            updateSliderFill();
            updateVolumeIconUI();
        };
        slider.addEventListener('input', onInput);
        slider.addEventListener('change', onInput);
    }

    if (typeof backgroundMusic !== 'undefined' && backgroundMusic) {
        backgroundMusic.addEventListener('volumechange', () => {
            const v = Math.round(backgroundMusic.volume * 100);
            if (__vc.slider && document.activeElement !== __vc.slider) {
                __vc.slider.value = String(v);
                __vc.slider.style.setProperty('--value', v + '%');
            }
            updateVolumeIconUI();
        });
    }

    updateVolumeIconUI();
    positionVolumeCard();
}

function setupCardTilt() {
    const card = document.querySelector('.profile-card');
    if (!card) return;

    card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        const mouseX = e.clientX - centerX;
        const mouseY = e.clientY - centerY;
        
        const rotateX = (mouseY / rect.height) * -20;
        const rotateY = (mouseX / rect.width) * 20;
        
        card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(10px)`;
    });

    card.addEventListener('mouseleave', () => {
        card.style.transform = 'rotateX(0deg) rotateY(0deg) translateZ(0px)';
    });
}

function removeSocialButtonOutlines() {
    const style = document.createElement('style');
    style.textContent = `
    .social-link {
        border: none !important;
        outline: none !important;
        box-shadow: none !important;
        background: none !important;
    }
    .social-link svg, .social-link img {
        filter: drop-shadow(0 0 10px #fff);
    }
    .social-link:hover svg, .social-link:hover img {
        filter: drop-shadow(0 0 18px #fff);
    }
    .social-link:not(:hover) svg, .social-link:not(:hover) img {
        box-shadow: none !important;
    }
    .social-link.litecoin img {
        filter: drop-shadow(0 0 10px #fff) brightness(0) invert(1) !important;
    }
    .social-link.litecoin:hover img {
        filter: drop-shadow(0 0 18px #fff) brightness(0) invert(1) !important;
    }
    `;
    document.head.appendChild(style);
}

document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('selectstart', (e) => e.preventDefault());
    document.addEventListener('dragstart', (e) => e.preventDefault());

    setupCanvas();
    requestAnimationFrame(drawTopo);
    handleOverlay();
    setupTitleTyping();
    setupUsernameTyping();
    setupSocialLinks();
    setupResizeHandlers();
    setupAvatarTooltip();
    connectLanyard();
    setupBoldTooltips();
    removeSocialButtonOutlines();
    setupCardTilt();
    setupVolumeControl();
    setupMusicPlayer();
});

function setupUsernameTyping() {
    const h1 = document.getElementById('username');
    if (!h1) return;
    const full = 'Parallax';
    const cursor = document.createElement('span');
    cursor.className = 'cursor';
    h1.textContent = '';
    h1.appendChild(document.createTextNode(''));
    h1.appendChild(cursor);

    let i = 0;
    let forward = true;
    let nextBlink = 0;
    let cursorVisible = true;
    const typeSpeed = 150;
    const deleteSpeed = 85;
    const dwellAfterType = 900;
    const dwellAfterDelete = 650;

    function setText(t) {
        if (!h1.firstChild || h1.firstChild.nodeType !== Node.TEXT_NODE) {
            h1.insertBefore(document.createTextNode(t), cursor);
        } else {
            h1.firstChild.nodeValue = t;
        }
    }

    function blink(now) {
        if (now >= nextBlink) {
            cursorVisible = !cursorVisible;
            cursor.style.opacity = cursorVisible ? '1' : '0';
            nextBlink = now + 450;
        }
        requestAnimationFrame(blink);
    }

    function cycle() {
        if (forward) {
            if (i < full.length) {
                i++;
                setText(full.slice(0, i));
                setTimeout(cycle, typeSpeed);
            } else {
                setTimeout(() => { forward = false; cycle(); }, dwellAfterType);
            }
        } else {
            if (i > 0) {
                i--;
                setText(full.slice(0, i));
                setTimeout(cycle, deleteSpeed);
            } else {
                setText('');
                setTimeout(() => { forward = true; cycle(); }, dwellAfterDelete);
            }
        }
    }

    setText('');
    requestAnimationFrame((t) => { nextBlink = t + 450; blink(t); });
    cycle();
}

const overlay = document.getElementById('enter-overlay');
const mainContent = document.getElementById('main-content');

const backgroundMusic = new Audio('assets/24 Songs - Playboi Carti.mp3');
backgroundMusic.volume = 0.67;
backgroundMusic.loop = true;

overlay.addEventListener('click', () => {
    overlay.style.display = 'none';
    
    mainContent.classList.remove('hidden');

    backgroundMusic.play().catch(err => {
        console.error('Music play failed:', err);
    });

    if (__vc.el) {
        __vc.el.style.opacity = '';
        __vc.el.style.pointerEvents = '';
    }
});

window.addEventListener('resize', () => {
    window.requestAnimationFrame(positionVolumeCard);
});
