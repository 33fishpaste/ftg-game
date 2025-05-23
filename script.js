class PlayerState {
    constructor(name, character, control = 'cpu-medium') {
        this.name = name;
        this.character = character;
        this.hp = 100;
        this.prev_hp = 100;
        this.command = null;
        this.sidestep_cd = 0;
        this.sidestep_streak = 0;
        this.hold_counter_cd = 0;
        this.trauma = 0;
        this.last_command = null;
        this.locked = false;
        this.state = '立ち';
        this.downTechnique = null;
        this.control = control; // 'player', 'cpu-weak', 'cpu-medium', 'cpu-strong'
    }
}

const Commands = {
    GRAB: 'Grab',
    HOLD: 'Hold',
    SIDESTEP: 'Sidestep',
    HOLD_COUNTER: 'Hold Counter',
    GUARD: 'Guard'
};

const COMMAND_LIST = Object.values(Commands);

function getCommandLabel(cmd) {
    return MESSAGES?.battle?.commands?.[cmd] || cmd;
}

const DOWN_COMMANDS = [
    '弱パンチ', '強パンチ', '弱キック', '強キック',
    '弱特殊', '強特殊',
    '掴み(頭側)', '掴み(脚側)',
    'ホールド(頭側)', 'ホールド(脚側)',
    '反転'
];

const DOWN_PREFIX_MAP = {
    '弱パンチ': '弱パンチ',
    '強パンチ': '強パンチ',
    '弱キック': '弱キック',
    '強キック': '強キック',
    '弱特殊': '弱特殊技',
    '強特殊': '強特殊技',
    '掴み(頭側)': '掴み技_頭側',
    '掴み(脚側)': '掴み技_脚側',
    'ホールド(頭側)': 'ホールド技_頭側',
    'ホールド(脚側)': 'ホールド技_脚側',
    '反転': '反転'
};

let TECHNIQUES = {};

const DEFAULT_DELAY = 500;
let OUTPUT_DELAY = DEFAULT_DELAY;
const DEFAULT_WEAK_RATE = 30;
let CPU_WEAK_RATE = DEFAULT_WEAK_RATE;

const DB_NAME = 'ftg-game';
const STORE_NAME = 'data';

let MESSAGES = {};

function t(path) {
    return path.split('.').reduce((o, k) => (o ? o[k] : undefined), MESSAGES);
}

function format(str, data) {
    return str.replace(/{{(.*?)}}/g, (_, k) => (k in data ? data[k] : ''));
}

function openDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'key' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function getData(key) {
    const db = await openDb();
    return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => resolve(req.result ? req.result.value : null);
        req.onerror = () => resolve(null);
    });
}

async function setData(key, value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put({ key, value });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

function deleteDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.deleteDatabase(DB_NAME);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

class BattleSystem {
    constructor() {
        this.logCounter = 1;
        this.delay = OUTPUT_DELAY;
    }

    createCommandButtons(containerId) {
        const wrap = document.getElementById(containerId);
        if (!wrap) return;
        wrap.innerHTML = '';
        for (const cmd of COMMAND_LIST) {
            const btn = document.createElement('button');
            btn.textContent = getCommandLabel(cmd);
            btn.dataset.cmd = cmd;
            wrap.appendChild(btn);
        }
    }

    createDownButtons(containerId) {
        const wrap = document.getElementById(containerId);
        if (!wrap) return;
        wrap.innerHTML = '';
        for (const cmd of DOWN_COMMANDS) {
            const btn = document.createElement('button');
            btn.textContent = cmd;
            btn.dataset.down = cmd;
            wrap.appendChild(btn);
        }
    }

    refreshPlayerUI(player, prefix) {
        const hpFill = document.getElementById(`${prefix}HpFill`);
        const hpText = document.getElementById(`${prefix}HpText`);
        if (hpText) hpText.textContent = player.hp;
        if (hpFill) {
            const gradient = this.hpGradient(player.prev_hp, player.hp);
            hpFill.style.background = gradient;
        }
        const ss = document.getElementById(`${prefix}SidestepCd`);
        const hc = document.getElementById(`${prefix}HoldCounterCd`);
        const tr = document.getElementById(`${prefix}Trauma`);
        const st = document.getElementById(`${prefix}State`);
        if (ss) ss.textContent = player.sidestep_cd;
        if (hc) hc.textContent = player.hold_counter_cd;
        if (tr) tr.textContent = player.trauma;
        if (st) st.textContent = player.state;
        const buttons = document.querySelectorAll(`#${prefix}Commands button`);
        const opponent = prefix === 'p1' ? this.p2 : this.p1;
        const oppDown = opponent && (opponent.state === '仰向け' || opponent.state === 'うつ伏せ');
        buttons.forEach(btn => {
            btn.classList.remove('selected', 'disabled');
            const cmd = btn.dataset.cmd;
            if (player.locked || !this.getAvailableCommands(player).includes(cmd) || oppDown) {
                btn.classList.add('disabled');
            }
            if (player.command === cmd) {
                btn.classList.add('selected');
            }
        });

        if (this.p1 && this.p2) {
            this.refreshDownButtons(player, prefix, opponent);
        }
    }

    refreshDownButtons(player, prefix, opponent) {
        const container = document.getElementById(`${prefix}DownCommands`);
        if (!container) return;
        const buttons = container.querySelectorAll('button');
        const down = opponent && (opponent.state === '仰向け' || opponent.state === 'うつ伏せ');
        buttons.forEach(btn => {
            btn.classList.remove('selected', 'disabled');
            if (!down) {
                btn.classList.add('disabled');
            }
            if (player.downTechnique === btn.dataset.down && down) {
                btn.classList.add('selected');
            }
        });
    }

    hpGradient(oldHp, newHp) {
        const clamp = v => Math.max(Math.min(v, 100), -100);
        oldHp = clamp(oldHp);
        newHp = clamp(newHp);
        if (newHp >= 0) {
            const green = newHp;
            const orange = Math.max(oldHp - newHp, 0);
            const red = 100 - Math.max(oldHp, 0);
            return `linear-gradient(to right, green 0%, green ${green}%, orange ${green}%, orange ${green + orange}%, red ${green + orange}%, red 100%)`;
        } else {
            const prevNeg = Math.max(-oldHp, 0);
            const currNeg = Math.max(-newHp, 0);
            const orange = Math.max(currNeg - prevNeg, 0);
            const black = currNeg - orange;
            const red = 100 - currNeg;
            return `linear-gradient(to right, red 0%, red ${red}%, orange ${red}%, orange ${red + orange}%, black ${red + orange}%, black 100%)`;
        }
    }

    addLog(message) {
        const logElement = document.getElementById('battleLog');
        const formatted = `${String(this.logCounter).padStart(2,'0')}: ${message}\n`;
        logElement.value += formatted;
        logElement.scrollTop = logElement.scrollHeight;
        this.logCounter++;
    }

    getAvailableCommands(player) {
        if (player.hp <= 0) return [];
        let cmds = [...COMMAND_LIST];
        if (player.sidestep_cd > 0) cmds = cmds.filter(c => c !== Commands.SIDESTEP);
        if (player.hold_counter_cd > 0) cmds = cmds.filter(c => c !== Commands.HOLD_COUNTER);
        if (player.trauma > 0) cmds = cmds.filter(c => c !== Commands.HOLD);
        return cmds;
    }

    setLock(player, flag, prefix) {
        player.locked = flag;
        this.refreshPlayerUI(player, prefix);
    }

    randomTechnique(prefix) {
        const keys = Object.keys(TECHNIQUES).filter(k => k.startsWith(prefix));
        if (keys.length === 0) return null;
        const key = keys[Math.floor(Math.random() * keys.length)];
        return TECHNIQUES[key];
    }

    labelForTech(tech) {
        const name = tech['技名'] || '';
        if (name.includes('弱パンチ')) return '弱パンチ';
        if (name.includes('強パンチ')) return '強パンチ';
        if (name.includes('弱キック')) return '弱キック';
        if (name.includes('強キック')) return '強キック';
        if (name.includes('弱特殊')) return '弱特殊';
        if (name.includes('強特殊')) return '強特殊';
        if (name.includes('掴み技') && name.includes('頭側')) return '掴み(頭側)';
        if (name.includes('掴み技') && name.includes('脚側')) return '掴み(脚側)';
        if (name.includes('ホールド技') && name.includes('頭側')) return 'ホールド(頭側)';
        if (name.includes('ホールド技') && name.includes('脚側')) return 'ホールド(脚側)';
        if (name.includes('反転') || name.includes('ターンオーバー')) return '反転';
        return null;
    }

    async applyTechnique(att, def, tech, attPrefix, defPrefix) {
        if (!tech) return;
        const dmg = tech['ダメージ'] || 0;
        this.addLog(format(t('logs.techUsed'), {
            attacker: att.name,
            techName: tech['技名'],
            description: tech['説明']
        }));
        att.downTechnique = this.labelForTech(tech);
        this.refreshPlayerUI(att, attPrefix);
        def.state = tech['ダウン状態'] || def.state;
        if (dmg > 0) {
            def.prev_hp = def.hp;
            def.hp -= dmg;
        }
        this.refreshPlayerUI(def, defPrefix);
        this.refreshPlayerUI(att, attPrefix);
        await this.wait();
        att.downTechnique = null;
        this.refreshPlayerUI(att, attPrefix);
    }

    randomDownTechnique(state, includeHold = false, choice = null) {
        if (choice) {
            const mid = DOWN_PREFIX_MAP[choice];
            if (!mid) return null;
            const prefix = `相手${state}ダウン中_${mid}`;
            return this.randomTechnique(prefix);
        }
        let prefixes = [];
        if (state === '仰向け') {
            prefixes = [
                '相手仰向けダウン中_弱パンチ',
                '相手仰向けダウン中_強パンチ',
                '相手仰向けダウン中_弱キック',
                '相手仰向けダウン中_強キック',
                '相手仰向けダウン中_弱特殊技',
                '相手仰向けダウン中_強特殊技',
                '相手仰向けダウン中_掴み技_頭側',
                '相手仰向けダウン中_掴み技_脚側'
            ];
            if (includeHold) {
                prefixes.push('相手仰向けダウン中_ホールド技_頭側');
                prefixes.push('相手仰向けダウン中_ホールド技_脚側');
                prefixes.push('相手仰向けダウン中_反転');
            }
        } else if (state === 'うつ伏せ') {
            prefixes = [
                '相手うつ伏せダウン中_弱パンチ',
                '相手うつ伏せダウン中_強パンチ',
                '相手うつ伏せダウン中_弱キック',
                '相手うつ伏せダウン中_強キック',
                '相手うつ伏せダウン中_弱特殊技',
                '相手うつ伏せダウン中_強特殊技',
                '相手うつ伏せダウン中_掴み技_頭側',
                '相手うつ伏せダウン中_掴み技_脚側'
            ];
            if (includeHold) {
                prefixes.push('相手うつ伏せダウン中_ホールド技_頭側');
                prefixes.push('相手うつ伏せダウン中_ホールド技_脚側');
                prefixes.push('相手うつ伏せダウン中_反転');
            }
        }
        if (prefixes.length === 0) return null;
        const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
        return this.randomTechnique(prefix);
    }

    async followUpDown(att, def, attPrefix, defPrefix, includeHold = false) {
        if (!(def.state === '仰向け' || def.state === 'うつ伏せ')) return;

        if (att.control === 'player') {
            this.refreshPlayerUI(att, attPrefix);
            const choice = await this.waitForDownCommand(att, attPrefix);
            const tech = this.randomDownTechnique(def.state, includeHold, choice);
            await this.applyTechnique(att, def, tech, attPrefix, defPrefix);
            if (def.hp > 0 && !includeHold) {
                def.state = '立ち';
                this.refreshPlayerUI(def, defPrefix);
            }
            att.downTechnique = null;
            this.refreshPlayerUI(att, attPrefix);
            return;
        }

        if (def.hp > 0 && !includeHold) {
            const probs = [0.75, 0.5, 0.25, 0];
            for (let i = 0; i < probs.length; i++) {
                if (Math.random() >= probs[i]) {
                    this.addLog(t('logs.chaseFail'));
                    if (def.hp > 0) {
                        def.state = '立ち';
                        this.refreshPlayerUI(def, defPrefix);
                    }
                    break;
                }
                const tech = this.randomDownTechnique(def.state, false);
                await this.applyTechnique(att, def, tech, attPrefix, defPrefix);
                if (def.hp <= 0) break;
            }
        }

        if (def.hp <= 0 || includeHold) {
            const tech = this.randomDownTechnique(def.state, true);
            await this.applyTechnique(att, def, tech, attPrefix, defPrefix);
        }
    }

    determineTechniques(attCmd, defCmd) {
        const list = [];
        const pushRandom = (p) => {
            const t = this.randomTechnique(p);
            if (t) list.push(t);
        };

        if (attCmd === Commands.GRAB) pushRandom('掴み_正面');
        else if (attCmd === Commands.GUARD && defCmd === Commands.SIDESTEP) pushRandom('掴み_正面');
        else if (attCmd === Commands.SIDESTEP && defCmd === Commands.GRAB) pushRandom('掴み_背後');
        else if (attCmd === Commands.HOLD) pushRandom('ホールド_正面');
        else if (attCmd === Commands.SIDESTEP && defCmd === Commands.HOLD) pushRandom('ホールド_背後');
        else if (attCmd === Commands.HOLD_COUNTER && defCmd === Commands.HOLD) {
            const variant = Math.random() < 0.5 ? 'A' : 'B';
            const start = TECHNIQUES[`ホールド返し_正面_${variant}_開始`];
            const pursue = TECHNIQUES[`ホールド返し_正面_${variant}_追撃`];
            const end = TECHNIQUES[`ホールド返し_正面_${variant}_終了`];
            if (start && pursue && end) {
                list.push(start);
                const loops = Math.floor(Math.random() * 3) + 1;
                for (let i = 0; i < loops; i++) list.push(pursue);
                list.push(end);
            }
        }
        else if (attCmd === Commands.SIDESTEP && defCmd === Commands.HOLD_COUNTER) pushRandom('突き上げ_正面');
        else if (attCmd === Commands.GUARD && defCmd === Commands.HOLD_COUNTER) pushRandom('突き上げ_背後');

        return list;
    }

    chooseAICommand(player, opponent = null) {
        if (player.hp <= 0) return null;
        const choices = this.getAvailableCommands(player);
        if (choices.length === 0) return null;

        const oppCmd = opponent ? opponent.command : null;

        if (player.control === "cpu-weak") {
            if (oppCmd && Math.random() < CPU_WEAK_RATE / 100) {
                const loseChoices = choices.filter(c => this.outcome(c, oppCmd) === "lose");
                if (loseChoices.length > 0) {
                    return loseChoices[Math.floor(Math.random() * loseChoices.length)];
                }
            }
            return choices[Math.floor(Math.random() * choices.length)];
        }

        if (player.control === "cpu-strong") {
            let pool = [...choices];
            if (opponent) {
                if (opponent.trauma > 0) {
                    pool = pool.filter(c => c !== Commands.HOLD_COUNTER);
                }
                if (opponent.sidestep_cd > 0) {
                    const limited = pool.filter(c => c === Commands.HOLD || c === Commands.SIDESTEP);
                    if (limited.length > 0) pool = limited;
                }
            }
            if (pool.length === 0) pool = choices;
            if (oppCmd) {
                const wins = pool.filter(c => this.outcome(c, oppCmd) === "win");
                if (wins.length > 0) return wins[Math.floor(Math.random() * wins.length)];
            }
            return pool[Math.floor(Math.random() * pool.length)];
        }

        return choices[Math.floor(Math.random() * choices.length)];
    }


    waitForPlayerCommand(player, prefix) {
        return new Promise(resolve => {
            const container = document.getElementById(`${prefix}Commands`);
            const handler = (e) => {
                const cmd = e.target.dataset.cmd;
                if (!cmd) return;
                if (e.target.classList.contains('disabled')) return;
                player.command = cmd;
                container.removeEventListener('click', handler);
                this.refreshPlayerUI(player, prefix);
                resolve();
            };
            container.addEventListener('click', handler);
        });
    }

    waitForDownCommand(player, prefix) {
        return new Promise(resolve => {
            const container = document.getElementById(`${prefix}DownCommands`);
            const handler = (e) => {
                const cmd = e.target.dataset.down;
                if (!cmd) return;
                if (e.target.classList.contains('disabled')) return;
                player.downTechnique = cmd;
                container.removeEventListener('click', handler);
                this.refreshPlayerUI(player, prefix);
                resolve(cmd);
            };
            container.addEventListener('click', handler);
        });
    }

    outcome(cmdA, cmdB) {
        if (cmdA === cmdB) return 'tie';
        const matrix = {
            [Commands.GRAB]:      { [Commands.GUARD]: 'win', [Commands.HOLD]: 'lose', [Commands.SIDESTEP]: 'lose', [Commands.HOLD_COUNTER]: 'win' },
            [Commands.HOLD]:      { [Commands.GRAB]: 'win', [Commands.GUARD]: 'win', [Commands.SIDESTEP]: 'lose', [Commands.HOLD_COUNTER]: 'lose' },
            [Commands.SIDESTEP]:  { [Commands.GRAB]: 'win', [Commands.HOLD]: 'win', [Commands.HOLD_COUNTER]: 'win', [Commands.GUARD]: 'lose' },
            [Commands.HOLD_COUNTER]: { [Commands.HOLD]: 'win', [Commands.GRAB]: 'lose', [Commands.SIDESTEP]: 'lose', [Commands.GUARD]: 'lose' },
            [Commands.GUARD]:     { [Commands.SIDESTEP]: 'win', [Commands.HOLD_COUNTER]: 'win', [Commands.GRAB]: 'lose', [Commands.HOLD]: 'lose' }
        };
        return (matrix[cmdA] && matrix[cmdA][cmdB]) || 'tie';
    }

    reduceTrauma(player) {
        if (player.trauma > 0) {
            player.trauma = Math.max(player.trauma - 1, 0);
        }
    }

    updateCooldowns(player) {
        if (player.command === Commands.SIDESTEP) {
            player.sidestep_streak++;
            player.sidestep_cd = player.sidestep_streak;
        } else {
            player.sidestep_streak = 0;
        }
        if (player.command === Commands.HOLD_COUNTER) {
            player.hold_counter_cd = 1;
        }
        player.sidestep_cd = Math.max(player.sidestep_cd - 1, 0);
        player.hold_counter_cd = Math.max(player.hold_counter_cd - 1, 0);
        player.last_command = player.command;
        player.command = null;
    }

    async startBattle() {
        const p1Input = document.getElementById('player1Name');
        const p2Input = document.getElementById('player2Name');
        const c1Input = document.getElementById('player1Control');
        const c2Input = document.getElementById('player2Control');
        const storedP1 = await getData('p1Name');
        const storedP2 = await getData('p2Name');
        const storedC1 = await getData('p1Control');
        const storedC2 = await getData('p2Control');
        const p1Name = p1Input ? p1Input.value : (storedP1 || 'Player 1');
        const p2Name = p2Input ? p2Input.value : (storedP2 || 'Player 2');
        const p1Control = c1Input ? c1Input.value : (storedC1 || 'cpu-medium');
        const p2Control = c2Input ? c2Input.value : (storedC2 || 'cpu-medium');

        const span1 = document.getElementById('battlePlayer1');
        const span2 = document.getElementById('battlePlayer2');
        if (span1) span1.textContent = p1Name;
        if (span2) span2.textContent = p2Name;

        document.getElementById('battleLog').value = '';
        this.logCounter = 1;
        const backBtn = document.getElementById('returnButton');
        if (backBtn) backBtn.style.display = 'none';

        const p1Char = p1Name.split(' ')[0];
        const p2Char = p2Name.split(' ')[0];
        const p1 = new PlayerState(p1Name, p1Char, p1Control);
        const p2 = new PlayerState(p2Name, p2Char, p2Control);

        this.p1 = p1;
        this.p2 = p2;

        this.createCommandButtons('p1Commands');
        this.createCommandButtons('p2Commands');
        this.createDownButtons('p1DownCommands');
        this.createDownButtons('p2DownCommands');

        this.addLog(format(t('logs.battleStart'), { p1: p1.name, p2: p2.name }));
        this.refreshPlayerUI(p1, 'p1');
        this.refreshPlayerUI(p2, 'p2');

        while (p1.hp > -100 && p2.hp > -100) {
            await this.executeTurn(p1, p2);
        }

        this.addLog(t('logs.battleEnd'));
        if (backBtn) backBtn.style.display = 'block';
    }

    async executeTurn(p1, p2) {
        this.reduceTrauma(p1);
        this.reduceTrauma(p2);

        p1.prev_hp = p1.hp;
        p2.prev_hp = p2.hp;

        if (p1.hp <= 0 || p2.hp <= 0) {
            const att = p1.hp > 0 ? p1 : p2;
            const def = p1.hp > 0 ? p2 : p1;
            const attPrefix = p1.hp > 0 ? 'p1' : 'p2';
            const defPrefix = p1.hp > 0 ? 'p2' : 'p1';
            await this.followUpDown(att, def, attPrefix, defPrefix, true);
            this.refreshPlayerUI(att, attPrefix);
            this.refreshPlayerUI(def, defPrefix);
            return;
        }

        if (p1.control === 'player' && p2.control === 'player') {
            await Promise.all([
                this.waitForPlayerCommand(p1, 'p1'),
                this.waitForPlayerCommand(p2, 'p2')
            ]);
        } else if (p1.control === 'player') {
            await this.waitForPlayerCommand(p1, 'p1');
            p2.command = this.chooseAICommand(p2, p1);
        } else if (p2.control === 'player') {
            await this.waitForPlayerCommand(p2, 'p2');
            p1.command = this.chooseAICommand(p1, p2);
        } else {
            p1.command = this.chooseAICommand(p1, p2);
            p2.command = this.chooseAICommand(p2, p1);
        }

        this.refreshPlayerUI(p1, 'p1');
        this.refreshPlayerUI(p2, 'p2');

        this.addLog(format(t('logs.commandLog'), {
            p1: p1.name,
            p1Command: getCommandLabel(p1.command),
            p2: p2.name,
            p2Command: getCommandLabel(p2.command)
        }));

        const result1 = this.outcome(p1.command, p2.command);

        if (result1 === 'win') {
            const techs = this.determineTechniques(p1.command, p2.command);
            await this.performAttack(p1, p2, techs, 'p1', 'p2');
        } else if (result1 === 'lose') {
            const techs = this.determineTechniques(p2.command, p1.command);
            await this.performAttack(p2, p1, techs, 'p2', 'p1');
        } else {
            this.addLog(t('logs.simultaneous'));
        }

        this.updateCooldowns(p1);
        this.updateCooldowns(p2);

        this.refreshPlayerUI(p1, 'p1');
        this.refreshPlayerUI(p2, 'p2');

        await this.wait();
    }

    async performAttack(att, def, techs, attPrefix, defPrefix) {
        const isHC = att.command === Commands.HOLD_COUNTER && def.command === Commands.HOLD;
        if (isHC) {
            this.addLog(t('logs.holdCounterActive'));
            this.setLock(def, true, defPrefix);
            this.refreshPlayerUI(def, defPrefix);
            await this.wait();
        }
        let dealt = false;
        for (const t of techs) {
            const dmg = t['ダメージ'] || 0;
            this.addLog(format(t('logs.techUsed'), {
                attacker: att.name,
                techName: t['技名'],
                description: t['説明']
            }));
            def.state = t['ダウン状態'] || def.state;
            if (dmg > 0) {
                dealt = true;
                def.prev_hp = def.hp;
                def.hp -= dmg;
            }
            this.refreshPlayerUI(def, defPrefix);
            this.refreshPlayerUI(att, attPrefix);
            await this.wait();
        }
        if (!dealt) {
            def.prev_hp = def.hp;
            def.hp -= 10;
            this.refreshPlayerUI(def, defPrefix);
        }
        if (isHC) {
            def.trauma = 3;
            att.trauma = 0;
            this.addLog(format(t('logs.holdCounterSuccess'), {
                attacker: att.name,
                defender: def.name
            }));
            this.setLock(def, false, defPrefix);
            this.refreshPlayerUI(def, defPrefix);
            await this.wait();
        }
        if (att.trauma > 0) att.trauma = Math.max(att.trauma - 1, 0);
        this.addLog(format(t('logs.hpLog'), { name: def.name, hp: def.hp }));
        this.refreshPlayerUI(def, defPrefix);

        if (def.hp > -100) {
            const includeHold = def.hp <= 0;
            await this.followUpDown(att, def, attPrefix, defPrefix, includeHold);
        }
    }

    wait(ms) {
        if (ms === undefined) ms = this.delay;
        return new Promise(r => setTimeout(r, ms));
    }
}

const battleSystem = new BattleSystem();

function startBattle() {
    battleSystem.startBattle();
}

function decodeBase64Image(base64) {
    try {
        const binary = atob(base64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'image/png' });
        return URL.createObjectURL(blob);
    } catch (e) {
        console.error('Failed to decode base64 image', e);
        return '';
    }
}
function updatePlayerInfo(playerId) {
    const characterSelect = document.getElementById(`${playerId}CharacterSelect`);
    const genderSelect = document.getElementById(`${playerId}GenderSelect`);
		const typeSelect = document.getElementById(`${playerId}TypeSelect`);
    const playerNameInput = document.getElementById(`${playerId}Name`);
    const imageElement = document.getElementById(`${playerId}Image`);

    // キャラクター名と性別と性格を取得
    const characterName = characterSelect.value;
    const gender = genderSelect.value;
		const type = typeSelect.value;

    if (characterName && gender && type) {
        playerNameInput.value = `${characterName} (${gender}/${type})`;
        const info = CHARACTER_DATA?.['種族']?.[characterName];
        if (info && info['画像'] && info['画像']['ポートレート']) {
            const url = decodeBase64Image(info['画像']['ポートレート']);
            if (url) {
                imageElement.src = url;
                imageElement.style.display = 'block';
            } else {
                imageElement.style.display = 'none';
            }
        } else {
            imageElement.style.display = 'none';
        }
    } else {
        playerNameInput.value = '';
        imageElement.style.display = 'none';
    }
}

function setRandomSettings(playerId) {
    if (!CHARACTER_DATA) return;
    const characterOptions = Object.keys(CHARACTER_DATA['種族'] || {});
    const genderOptions = Object.keys(CHARACTER_DATA['性別'] || {});
    const typeOptions = Object.keys(CHARACTER_DATA['性格'] || {});

    // ランダムな値を選択
    const randomCharacter = characterOptions[Math.floor(Math.random() * characterOptions.length)];
    const randomGender = genderOptions[Math.floor(Math.random() * genderOptions.length)];
    const randomType = typeOptions[Math.floor(Math.random() * typeOptions.length)];

    // セレクト要素を更新
    document.getElementById(`${playerId}CharacterSelect`).value = randomCharacter;
    document.getElementById(`${playerId}GenderSelect`).value = randomGender;
    document.getElementById(`${playerId}TypeSelect`).value = randomType;

    // プレイヤー情報を更新
    updatePlayerInfo(playerId);
}

// バトルログをクリップボードにコピーする関数
function copyBattleLog() {
    const battleLog = document.getElementById('battleLog').value;

    // 任意のテキストをバトルログの先頭に追加
    const headerText = t('copyHeader');
    const modifiedLog = `${headerText}\n\n${battleLog}`; // 1行空ける

    // クリップボードにコピー
    navigator.clipboard.writeText(modifiedLog).then(() => {
        alert(t('alerts.battleLogCopied'));
    }).catch(err => {
        console.error("コピーに失敗しました:", err);
    });
}

// 定型文をクリップボードにコピーする関数
function copyTemplateText(templateId) {
    let templateText = "";

    // 定型文を指定
    switch (templateId) {
        case 1:
            templateText = t('templateTexts.template1');
            break;
        case 2:
            templateText = t('templateTexts.template2');
            break;
        case 3:
            templateText = t('templateTexts.template3');
            break;
        default:
            console.error("無効なテンプレートIDです");
            return;
    }

    // クリップボードにコピー
    navigator.clipboard.writeText(templateText).then(() => {
        alert(format(t('alerts.templateCopied'), { id: templateId }));
    }).catch(err => {
        console.error("コピーに失敗しました:", err);
    });
}

function goToCharacterSelect() {
    location.href = 'characterSelect.html';
}

function goToSettings() {
    location.href = 'settings.html';
}

async function startBattleFromSelect() {
    const p1Name = document.getElementById('player1Name').value || 'Player 1';
    const p2Name = document.getElementById('player2Name').value || 'Player 2';
    const p1Control = document.getElementById('player1Control').value || 'cpu-medium';
    const p2Control = document.getElementById('player2Control').value || 'cpu-medium';
    await setData('p1Name', p1Name);
    await setData('p2Name', p2Name);
    await setData('p1Control', p1Control);
    await setData('p2Control', p2Control);
    location.href = 'battle.html';
}

function backToSelect() {
    location.href = 'characterSelect.html';
}

async function loadBattleNames() {
    const span1 = document.getElementById('battlePlayer1');
    const span2 = document.getElementById('battlePlayer2');
    const p1 = await getData('p1Name');
    const p2 = await getData('p2Name');
    if (span1) span1.textContent = p1 || 'Player 1';
    if (span2) span2.textContent = p2 || 'Player 2';
}

loadBattleNames();

let CHARACTER_DATA = null;

function flattenTech(data) {
    const result = {};
    Object.values(data).forEach(g => Object.assign(result, g));
    return result;
}

function populateCharacterOptions() {
    if (!CHARACTER_DATA) return;
    const characters = Object.keys(CHARACTER_DATA['種族'] || {});
    const genders = Object.keys(CHARACTER_DATA['性別'] || {});
    const types = Object.keys(CHARACTER_DATA['性格'] || {});

    ['player1', 'player2'].forEach(id => {
        const cSel = document.getElementById(`${id}CharacterSelect`);
        if (cSel && cSel.options.length === 1) {
            characters.forEach(n => {
                const opt = document.createElement('option');
                opt.value = n;
                opt.textContent = n;
                cSel.appendChild(opt);
            });
        }

        const gSel = document.getElementById(`${id}GenderSelect`);
        if (gSel && gSel.options.length === 1) {
            genders.forEach(n => {
                const opt = document.createElement('option');
                opt.value = n;
                opt.textContent = n;
                gSel.appendChild(opt);
            });
        }

        const tSel = document.getElementById(`${id}TypeSelect`);
        if (tSel && tSel.options.length === 1) {
            types.forEach(n => {
                const opt = document.createElement('option');
                opt.value = n;
                opt.textContent = n;
                tSel.appendChild(opt);
            });
        }
    });
}

function populateTechList() {
    const tbody = document.getElementById('techTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    Object.values(TECHNIQUES).forEach(t => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${t['技名']}</td><td>${t['ダメージ']}</td><td>${t['説明']}</td><td>${t['ダウン状態']}</td>`;
        tbody.appendChild(tr);
    });
}

async function loadMessages() {
    if (Object.keys(MESSAGES).length > 0) return;
    try {
        const resp = await fetch('messages.json');
        if (resp.ok) {
            MESSAGES = await resp.json();
        }
    } catch (e) {
        console.error('failed to load messages', e);
    }
}

function applyBattleMessages() {
    const title = document.getElementById('battleTitle');
    if (title) title.textContent = t('index.title');
    const startBtn = document.getElementById('startBattleButton');
    if (startBtn) startBtn.textContent = t('battle.startButton');
    const returnBtn = document.getElementById('returnButton');
    if (returnBtn) returnBtn.textContent = t('battle.returnButton');

    const logTitle = document.getElementById('logSectionTitle');
    if (logTitle) logTitle.textContent = t('battle.logSectionTitle');
    const copyBtn = document.getElementById('copyLogButton');
    if (copyBtn) copyBtn.textContent = t('battle.copyLogButton');
    const tTitle = document.getElementById('templateCopyTitle');
    if (tTitle) tTitle.textContent = t('battle.templateCopyTitle');
    const tc1 = document.getElementById('templateCopy1');
    if (tc1) tc1.textContent = t('battle.templateCopy1');
    const tc2 = document.getElementById('templateCopy2');
    if (tc2) tc2.textContent = t('battle.templateCopy2');
    const tc3 = document.getElementById('templateCopy3');
    if (tc3) tc3.textContent = t('battle.templateCopy3');

    const techTitle = document.getElementById('techListTitle');
    if (techTitle) techTitle.textContent = t('battle.techListTitle');
    const thName = document.getElementById('techHeaderName');
    if (thName) thName.textContent = t('battle.techTableHeaders.name');
    const thDamage = document.getElementById('techHeaderDamage');
    if (thDamage) thDamage.textContent = t('battle.techTableHeaders.damage');
    const thDesc = document.getElementById('techHeaderDescription');
    if (thDesc) thDesc.textContent = t('battle.techTableHeaders.description');
    const thDown = document.getElementById('techHeaderDownState');
    if (thDown) thDown.textContent = t('battle.techTableHeaders.downState');
}

async function loadData() {
    await loadMessages();
    applyBattleMessages();
    const tech = await getData('techniques');
    if (tech) {
        TECHNIQUES = flattenTech(tech);
        populateTechList();
    } else {
        fetch('techniques.json')
            .then(r => r.json())
            .then(d => { TECHNIQUES = flattenTech(d); populateTechList(); });
    }

    const charData = await getData('characterData');
    if (charData) {
        CHARACTER_DATA = charData;
        populateCharacterOptions();
    } else {
        fetch('characterData.json')
            .then(r => r.json())
            .then(d => { CHARACTER_DATA = d; populateCharacterOptions(); });
    }

    const delayVal = await getData('outputDelay');
    if (delayVal !== null) {
        OUTPUT_DELAY = delayVal;
        if (battleSystem) battleSystem.delay = delayVal;
    }
    const delayInput = document.getElementById('delayInput');
    if (delayInput) delayInput.value = OUTPUT_DELAY;

    const weakRateVal = await getData("cpuWeakRate");
    if (weakRateVal !== null) {
        CPU_WEAK_RATE = weakRateVal;
    }
    const weakInput = document.getElementById("cpuWeakRateInput");
    if (weakInput) weakInput.value = CPU_WEAK_RATE;
}

async function importTechniques() {
    const text = document.getElementById('techniqueJson').value;
    try {
        const json = JSON.parse(text);
        await setData('techniques', json);
        alert(t('alerts.techSaved'));
    } catch (e) {
        alert(t('alerts.jsonError'));
    }
}

async function importCharacters() {
    const text = document.getElementById('characterJson').value;
    try {
        const json = JSON.parse(text);
        await setData('characterData', json);
        alert(t('alerts.characterSaved'));
    } catch (e) {
        alert(t('alerts.jsonError'));
    }
}

async function saveDelay() {
    const input = document.getElementById('delayInput');
    if (!input) return;
    const val = parseInt(input.value, 10) || 0;
    OUTPUT_DELAY = val;
    if (battleSystem) battleSystem.delay = val;
    await setData('outputDelay', val);
    alert(t('alerts.delaySaved'));
}

async function saveCpuWeakRate() {
    const input = document.getElementById("cpuWeakRateInput");
    if (!input) return;
    const val = parseInt(input.value, 10);
    CPU_WEAK_RATE = isNaN(val) ? DEFAULT_WEAK_RATE : val;
    await setData("cpuWeakRate", CPU_WEAK_RATE);
    alert("CPU弱の不利選択率を保存しました");
}

async function deleteDatabase() {
    await deleteDb();
    alert(t('alerts.dbDeleted'));
}

function backToTitle() {
    location.href = 'index.html';
}

loadData();
