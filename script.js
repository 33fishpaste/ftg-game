class PlayerState {
    constructor(name) {
        this.name = name;
        this.hp = 100;
        this.command = null;
        this.sidestep_cd = 0;
        this.sidestep_streak = 0;
        this.hold_counter_cd = 0;
        this.trauma = 0;
        this.last_command = null;
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

let TECHNIQUES = {};

const DB_NAME = 'ftg-game';
const STORE_NAME = 'data';

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
    }

    createCommandButtons(containerId) {
        const wrap = document.getElementById(containerId);
        if (!wrap) return;
        wrap.innerHTML = '';
        for (const cmd of COMMAND_LIST) {
            const btn = document.createElement('button');
            btn.textContent = cmd;
            btn.dataset.cmd = cmd;
            wrap.appendChild(btn);
        }
    }

    refreshPlayerUI(player, prefix) {
        const hpFill = document.getElementById(`${prefix}HpFill`);
        if (hpFill) hpFill.style.width = `${Math.max(player.hp,0)}px`;
        const ss = document.getElementById(`${prefix}SidestepCd`);
        const hc = document.getElementById(`${prefix}HoldCounterCd`);
        const tr = document.getElementById(`${prefix}Trauma`);
        if (ss) ss.textContent = player.sidestep_cd;
        if (hc) hc.textContent = player.hold_counter_cd;
        if (tr) tr.textContent = player.trauma;
        const buttons = document.querySelectorAll(`#${prefix}Commands button`);
        buttons.forEach(btn => {
            btn.classList.remove('selected', 'disabled');
            const cmd = btn.dataset.cmd;
            if (!this.getAvailableCommands(player).includes(cmd)) {
                btn.classList.add('disabled');
            }
            if (player.command === cmd) {
                btn.classList.add('selected');
            }
        });
    }

    addLog(message) {
        const logElement = document.getElementById('battleLog');
        const formatted = `${String(this.logCounter).padStart(2,'0')}: ${message}\n`;
        logElement.value += formatted;
        logElement.scrollTop = logElement.scrollHeight;
        this.logCounter++;
    }

    getAvailableCommands(player) {
        let cmds = [...COMMAND_LIST];
        if (player.sidestep_cd > 0) cmds = cmds.filter(c => c !== Commands.SIDESTEP);
        if (player.hold_counter_cd > 0) cmds = cmds.filter(c => c !== Commands.HOLD_COUNTER);
        if (player.trauma > 0) cmds = cmds.filter(c => c !== Commands.HOLD);
        return cmds;
    }

    randomTechnique(prefix) {
        const keys = Object.keys(TECHNIQUES).filter(k => k.startsWith(prefix));
        if (keys.length === 0) return null;
        const key = keys[Math.floor(Math.random() * keys.length)];
        return TECHNIQUES[key];
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

    chooseCommand(player) {
        const choices = this.getAvailableCommands(player);
        return choices[Math.floor(Math.random() * choices.length)];
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
        const p1Name = p1Input ? p1Input.value : (localStorage.getItem('p1Name') || 'Player 1');
        const p2Name = p2Input ? p2Input.value : (localStorage.getItem('p2Name') || 'Player 2');

        const span1 = document.getElementById('battlePlayer1');
        const span2 = document.getElementById('battlePlayer2');
        if (span1) span1.textContent = p1Name;
        if (span2) span2.textContent = p2Name;

        this.createCommandButtons('p1Commands');
        this.createCommandButtons('p2Commands');

        document.getElementById('battleLog').value = '';
        this.logCounter = 1;
        const backBtn = document.getElementById('returnButton');
        if (backBtn) backBtn.style.display = 'none';

        const p1 = new PlayerState(p1Name);
        const p2 = new PlayerState(p2Name);

        this.addLog(`${p1.name}と${p2.name}の戦闘開始`);
        this.refreshPlayerUI(p1, 'p1');
        this.refreshPlayerUI(p2, 'p2');

        while (p1.hp > 0 && p2.hp > 0) {
            await this.executeTurn(p1, p2);
        }

        this.addLog('戦闘終了');
        if (backBtn) backBtn.style.display = 'block';
    }

    async executeTurn(p1, p2) {
        this.reduceTrauma(p1);
        this.reduceTrauma(p2);

        p1.command = this.chooseCommand(p1);
        p2.command = this.chooseCommand(p2);

        this.refreshPlayerUI(p1, 'p1');
        this.refreshPlayerUI(p2, 'p2');

        this.addLog(`${p1.name}: ${p1.command} / ${p2.name}: ${p2.command}`);

        const result1 = this.outcome(p1.command, p2.command);

        if (result1 === 'win') {
            const techs = this.determineTechniques(p1.command, p2.command);
            let damage = 0;
            for (const t of techs) {
                damage += t['ダメージ'];
                this.addLog(`${p1.name}の${t['技名']}! ${t['説明']}`);
            }
            if (damage === 0) damage = 10;
            p2.hp -= damage;
            if (p1.command === Commands.HOLD_COUNTER && p2.command === Commands.HOLD) {
                p2.trauma = 3;
                p1.trauma = 0;
                this.addLog(`${p1.name}のHold Counter成功！${p2.name}にTrauma付与`);
            }
            if (p1.trauma > 0) p1.trauma = Math.max(p1.trauma - 1, 0);
            this.addLog(`${p2.name}のHP: ${p2.hp}`);
        } else if (result1 === 'lose') {
            const techs = this.determineTechniques(p2.command, p1.command);
            let damage = 0;
            for (const t of techs) {
                damage += t['ダメージ'];
                this.addLog(`${p2.name}の${t['技名']}! ${t['説明']}`);
            }
            if (damage === 0) damage = 10;
            p1.hp -= damage;
            if (p2.command === Commands.HOLD_COUNTER && p1.command === Commands.HOLD) {
                p1.trauma = 3;
                p2.trauma = 0;
                this.addLog(`${p2.name}のHold Counter成功！${p1.name}にTrauma付与`);
            }
            if (p2.trauma > 0) p2.trauma = Math.max(p2.trauma - 1, 0);
            this.addLog(`${p1.name}のHP: ${p1.hp}`);
        } else {
            this.addLog('相打ち');
        }

        this.updateCooldowns(p1);
        this.updateCooldowns(p2);

        this.refreshPlayerUI(p1, 'p1');
        this.refreshPlayerUI(p2, 'p2');

        await new Promise(r => setTimeout(r, 500));
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
    const headerText = "次のシーンを1つずつ書いてください。最初の5つを書いてください。";
    const modifiedLog = `${headerText}\n\n${battleLog}`; // 1行空ける

    // クリップボードにコピー
    navigator.clipboard.writeText(modifiedLog).then(() => {
        alert("バトルログをコピーしました！");
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
            templateText = "・攻撃側の部位状態には感触を、モーションはどこをどうするかを記載し、受け手側のモーションには苦痛に悶え喘ぐ様を追加してください。 ・全てのワームは人間を襲う種族で恐怖を感じず、丈夫なため余程のことがない限りは呼吸困難や意識を失ったり、完全に壊死することはありません。また、敗北を認めません。 ダメージを受ける側のモーションは、両手で腹を押さえる、膝をつく、など、ダメージを受けた後の体の動作を書いてください。・察させる際は攻撃部位に触れさせてください。・双方のワームの性別と性格を考慮してください。性格は最後まで変わりません。01から05まで書き直して下さい。";
            break;
        case 2:
            templateText = "・攻撃側の部位状態には感触を、モーションはどこをどうするかを記載し、受け手側のモーションには苦痛に悶え喘ぐ様を追加してください。 ・全てのワームは人間を襲う種族で恐怖を感じず、丈夫なため余程のことがない限りは呼吸困難や意識を失ったり、完全に壊死することはありません。また、敗北を認めません。 ダメージを受ける側のモーションは、両手で腹を押さえる、膝をつく、など、ダメージを受けた後の体の動作を書いてください。・双方は仲間です。・双方のワームの性別と性格と関係性を考慮してください。性格は最後まで変わりません。01から05まで書き直して下さい。";
            break;
        case 3:
            templateText = "別ファイルにして続けてください。";
            break;
        default:
            console.error("無効なテンプレートIDです");
            return;
    }

    // クリップボードにコピー
    navigator.clipboard.writeText(templateText).then(() => {
        alert(`定型文${templateId}をコピーしました！`);
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

function startBattleFromSelect() {
    const p1Name = document.getElementById('player1Name').value || 'Player 1';
    const p2Name = document.getElementById('player2Name').value || 'Player 2';
    localStorage.setItem('p1Name', p1Name);
    localStorage.setItem('p2Name', p2Name);
    location.href = 'battle.html';
}

function backToSelect() {
    location.href = 'characterSelect.html';
}

function loadBattleNames() {
    const span1 = document.getElementById('battlePlayer1');
    const span2 = document.getElementById('battlePlayer2');
    if (span1) span1.textContent = localStorage.getItem('p1Name') || 'Player 1';
    if (span2) span2.textContent = localStorage.getItem('p2Name') || 'Player 2';
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

async function loadData() {
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
}

async function importTechniques() {
    const text = document.getElementById('techniqueJson').value;
    try {
        const json = JSON.parse(text);
        await setData('techniques', json);
        alert('技データを保存しました');
    } catch (e) {
        alert('JSONの解析に失敗しました');
    }
}

async function importCharacters() {
    const text = document.getElementById('characterJson').value;
    try {
        const json = JSON.parse(text);
        await setData('characterData', json);
        alert('キャラクターデータを保存しました');
    } catch (e) {
        alert('JSONの解析に失敗しました');
    }
}

async function deleteDatabase() {
    await deleteDb();
    alert('データベースを削除しました');
}

function backToTitle() {
    location.href = 'index.html';
}

loadData();
