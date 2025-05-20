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

class BattleSystem {
    constructor() {
        this.logCounter = 1;
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

        document.getElementById('battleLog').value = '';
        this.logCounter = 1;

        const p1 = new PlayerState(p1Name);
        const p2 = new PlayerState(p2Name);

        this.addLog(`${p1.name}と${p2.name}の戦闘開始`);

        while (p1.hp > 0 && p2.hp > 0) {
            await this.executeTurn(p1, p2);
        }

        this.addLog('戦闘終了');
        const backBtn = document.getElementById('returnButton');
        if (backBtn) backBtn.style.display = 'block';
    }

    async executeTurn(p1, p2) {
        this.reduceTrauma(p1);
        this.reduceTrauma(p2);

        p1.command = this.chooseCommand(p1);
        p2.command = this.chooseCommand(p2);

        this.addLog(`${p1.name}: ${p1.command} / ${p2.name}: ${p2.command}`);

        const result1 = this.outcome(p1.command, p2.command);
        const result2 = this.outcome(p2.command, p1.command);

        if (result1 === 'win') {
            p2.hp -= 10;
            if (p1.command === Commands.HOLD_COUNTER && p2.command === Commands.HOLD) {
                p2.trauma = 3;
                p1.trauma = 0;
                this.addLog(`${p1.name}のHold Counter成功！${p2.name}にTrauma付与`);
            }
            if (p1.trauma > 0) p1.trauma = Math.max(p1.trauma - 1, 0);
            this.addLog(`${p2.name}のHP: ${p2.hp}`);
        } else if (result1 === 'lose') {
            p1.hp -= 10;
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

        await new Promise(r => setTimeout(r, 500));
    }
}

const battleSystem = new BattleSystem();

function startBattle() {
    battleSystem.startBattle();
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

    // キャラクター名(性別)を自動設定
    if (characterName && gender && type) {
        playerNameInput.value = `${characterName} (${gender}/${type})`;

        // 画像を更新
        const imagePath = `./img/portrait/${characterName.replace(/\s/g, '_')}.webp`;
        imageElement.src = imagePath;
        imageElement.style.display = 'block';
    } else {
        playerNameInput.value = '';
        imageElement.style.display = 'none';
    }
}

function setRandomSettings(playerId) {
    const characterOptions = ['サナギ体',
'アラクネアワーム',
'ベルバーワーム',
'フォルミカアルビュスワーム',
'ジオフィリドワーム',
'アキャリナワーム',
'ランピリスワーム',
'コキリアワーム',
'エピラクナワーム',
'キャマラスワーム',
'ジェノミアスワーム',
'ミュスカワーム',
'ビエラワーム',
'プレクスワーム',
'レプトーフィスワーム',
'グリラスワーム',
'カッシスワーム',
'シシーラワーム',
'フォリアタスワーム',
'コレオプテラワーム',
'ベルクリネタスワーム'];
    const genderOptions = ['雄', '雌'];
    const typeOptions = [
        '好戦的で戦闘狂',
        '好戦的で支配的',
        '好戦的で紳士的',
        '非好戦的で卑怯',
        '非好戦的で冷酷',
        '非好戦的で慈愛'
    ];

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
