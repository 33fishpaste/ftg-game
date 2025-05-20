        class BattleSystem {
            constructor() {
                this.normalTargets = ['頭部', '首', '腕', '胸部', '腹部', '腿'];
                this.normalAttacks = ['特技1', '特技2', '蹴り', '殴り'];
                this.followupTargets = ['頭部'];
                this.followupAttacks = ['特技1', '特技2', '組み技'];
                this.finishTargets = ['頭部', '頭部'];
                this.finishAttacks = ['関節技', '恥辱技', 'ゴア技'];
				this.followupCombos = [
    { target: '首', attack: '関節技' },
    { target: '腿', attack: '関節技' },
    { target: '腕', attack: '関節技' },
    { target: '頭部', attack: '膝圧迫技' },
    { target: '頭部', attack: '手技' },
    { target: '頭部', attack: '特技1' },
    { target: '頭部', attack: '特技2' }
];

this.finishCombos = [
    { target: '頭部', attack: '恥辱技(手技)' },
    { target: '頭部', attack: 'ゴア技(膝圧迫技)' }
];
                this.logCounter = 1;
                this.rounds = {p1: 0, p2: 0};
                this.previousSecondHitFailed = {
                    p1: false,
                    p2: false
                };
                this.p1Name = '';
                this.p2Name = '';
            }

            getRandomItem(array, excludeItems = []) {
                let availableItems = array.filter(item => !excludeItems.includes(item));
                return availableItems[Math.floor(Math.random() * availableItems.length)];
            }

            getRandomItems(array, count, excludeItems = []) {
                let result = [];
                let available = [...array];
                for (let i = 0; i < count; i++) {
                    let index = Math.floor(Math.random() * available.length);
                    let item = available.splice(index, 1)[0];
                    if (!excludeItems.includes(item)) {
                        result.push(item);
                    }
                }
                return result;
            }

            addLog(message) {
                let logElement = document.getElementById('battleLog');
                let formattedMessage = `${String(this.logCounter).padStart(2, '0')}: ${message}\n`;
                logElement.value += formattedMessage;
                logElement.scrollTop = logElement.scrollHeight;
                this.logCounter++;
            }

            async startBattle() {
                const p1Input = document.getElementById('player1Name');
                const p2Input = document.getElementById('player2Name');
                const p1Name = p1Input ? p1Input.value : (localStorage.getItem('p1Name') || 'Player 1');
                const p2Name = p2Input ? p2Input.value : (localStorage.getItem('p2Name') || 'Player 2');

                // Store names for later use so battle.html doesn't need the inputs
                this.p1Name = p1Name;
                this.p2Name = p2Name;

                const span1 = document.getElementById('battlePlayer1');
                const span2 = document.getElementById('battlePlayer2');
                if (span1) span1.textContent = p1Name;
                if (span2) span2.textContent = p2Name;
                
                document.getElementById('battleLog').value = '';
                this.logCounter = 1;
                this.rounds = {p1: 0, p2: 0};

                while (this.rounds.p1 < 2 && this.rounds.p2 < 2) {
                    await this.executePreparePhase(p1Name, p2Name);
                }
            }

            async executePreparePhase(p1Name, p2Name) {
                // P1の準備
                let p1Target = this.getRandomItem(this.normalTargets);
                let p1Attacks = this.getRandomItems(this.normalAttacks, 2);
                let p2Guards = this.getRandomItems(this.normalTargets, 2);
                let p2GuardAttacks1 = this.getRandomItems(this.normalAttacks, 2);
                let p2GuardAttacks2 = this.getRandomItems(this.normalAttacks, 2);

                //this.addLog(`${p1Name} 狙う部位：${p1Target} 攻撃方法：1回目${p1Attacks[0]}、2回目${p1Attacks[1]} / ${p2Name} 警戒部位：[${p2Guards.join('、')}] 警戒攻撃方法：1回目[${p2GuardAttacks1.join('、')}] 2回目[${p2GuardAttacks2.join('、')}]`);

                // P2の準備
                let p2Target = this.getRandomItem(this.normalTargets);
                let p2Attacks = this.getRandomItems(this.normalAttacks, 2);
                let p1Guards = this.getRandomItems(this.normalTargets, 2);
                let p1GuardAttacks1 = this.getRandomItems(this.normalAttacks, 2);
                let p1GuardAttacks2 = this.getRandomItems(this.normalAttacks, 2);

                //this.addLog(`${p2Name} 狙う部位：${p2Target} 攻撃方法：1回目${p2Attacks[0]}、2回目${p2Attacks[1]} / ${p1Name} 警戒部位：[${p1Guards.join('、')}] 警戒攻撃方法：1回目[${p1GuardAttacks1.join('、')}] 2回目[${p1GuardAttacks2.join('、')}]`);

                // 攻撃判定
                let p1Success = this.calculateAttackSuccess(p1Target, p1Attacks, p2Guards, p2GuardAttacks1, p2GuardAttacks2);
                let p2Success = this.calculateAttackSuccess(p2Target, p2Attacks, p1Guards, p1GuardAttacks1, p1GuardAttacks2);

                if (p1Success > p2Success) {
                    await this.executeAttackPhase(p1Name, p2Name, p1Target, p1Attacks, p2Guards, p2GuardAttacks1, p2GuardAttacks2);
                } else if (p2Success > p1Success) {
                    await this.executeAttackPhase(p2Name, p1Name, p2Target, p2Attacks, p1Guards, p1GuardAttacks1, p1GuardAttacks2);
                } else {
                    //this.addLog(`${p1Name}と${p2Name}は睨み合っている...`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            calculateAttackSuccess(attackTarget, attacks, guardTargets, guardAttacks1, guardAttacks2) {
                let success = 0;
                if (!guardTargets.includes(attackTarget)) {
                    if (!guardAttacks1.includes(attacks[0])) {
                        success++;
                        if (!guardAttacks2.includes(attacks[1])) {
                            success++;
                        }
                    }
                }
                return success;
            }

            async executeAttackPhase(attackerName, defenderName, target, attacks, guardTargets, guardAttacks1, guardAttacks2) {
                // Determine attacker side based on stored names to avoid relying on input elements
                const currentP1Name = this.p1Name || localStorage.getItem('p1Name') || 'Player 1';
                const isP1Attacker = attackerName === currentP1Name;
                const defenderId = isP1Attacker ? 'p2' : 'p1';
                
                // 1撃目
                if (guardTargets.includes(target)) {
                    this.addLog(`${attackerName}は${target}を狙って${attacks[0]}したが、${defenderName}は${target}への攻撃を読み切って躱した。`);
                    return;
                }

                if (guardAttacks1.includes(attacks[0])) {
                    this.addLog(`${attackerName}は${target}を狙って${attacks[0]}したが、${defenderName}は${attacks[0]}攻撃を見切って躱した。`);
                    return;
                }

                this.addLog(`${attackerName}は${defenderName}の${target}に${attacks[0]}攻撃した。`);
                await new Promise(resolve => setTimeout(resolve, 500));

                // 2撃目
                if (this.previousSecondHitFailed[defenderId]) {
                    // 前ターンで2撃目を受けていた場合
                    this.addLog(`${attackerName}はさらに${defenderName}の${target}に${attacks[1]}攻撃した。${defenderName}は${attacks[1]}攻撃を見切っていたが、前回の攻撃の影響で防げなかった。`);
                    this.addLog(`${defenderName}はダウンした。`);
                } else {
                    if (guardAttacks2.includes(attacks[1])) {
                        this.addLog(`${attackerName}はさらに${target}を狙って${attacks[1]}したが、${defenderName}は${attacks[1]}への攻撃を読み切って躱した。`);
                        // 2撃目失敗フラグを立てる
                        this.previousSecondHitFailed[defenderId] = true;
                        return;
                    }
                    this.addLog(`${attackerName}はさらに${defenderName}の${target}に${attacks[1]}攻撃した。`);
                    this.addLog(`${defenderName}はダウンした。`);
                }

                // 追い討ち
//                let followupTarget = this.getRandomItem(this.followupTargets);
//                let followupAttack = this.getRandomItem(this.followupAttacks);
                let followupCombo = this.getRandomItem(this.followupCombos); // 固定で最初のコンボを選択
                let followupTarget = followupCombo.target;
                let followupAttack = followupCombo.attack;                
                //this.addLog(`${attackerName} 狙う部位：${followupTarget} 攻撃方法：${followupAttack}`);
                this.addLog(`${attackerName}は${followupAttack}攻撃の準備のため技を出す部位を攻撃部位に当てがい、今からすることを察させた。`);
                this.addLog(`${attackerName}はダウンしている${defenderName}の${followupTarget}に${followupAttack}攻撃した。`);

                // ラウンド更新
                const currentP1Name2 = this.p1Name || localStorage.getItem('p1Name') || 'Player 1';
                if (attackerName === currentP1Name2) {
                    this.rounds.p1++;
                } else {
                    this.rounds.p2++;
                }

                // ラウンド終了時にフラグをリセット
                this.previousSecondHitFailed.p1 = false;
                this.previousSecondHitFailed.p2 = false;
                
                if (this.rounds.p1 === 2 || this.rounds.p2 === 2) {
                    this.addLog(`${defenderName}は立ち上がれない。`);
                    this.addLog(`戦闘終了。`);
                    const backBtn = document.getElementById('returnButton');
                    if (backBtn) backBtn.style.display = 'block';

                    // フィニッシュ
//                    let finishTarget = this.getRandomItem(this.finishTargets);
//                    let finishAttack = this.getRandomItem(this.finishAttacks);
                let finishCombo = this.getRandomItem(this.finishCombos); // 固定で最初のコンボを選択
                let finishTarget = finishCombo.target;
                let finishAttack = finishCombo.attack;                
                    
                    //this.addLog(`${attackerName} 狙う部位：${finishTarget} 攻撃方法：${finishAttack}`);
                this.addLog(`${attackerName}は${finishAttack}攻撃の準備のため技を出す部位を攻撃部位に当てがい、今からすることを察させた。`);
                    this.addLog(`${attackerName}は最後に嫌がる${defenderName}の${finishTarget}に${finishAttack}攻撃した。`);
                    this.addLog(`${attackerName}は抵抗する${defenderName}の${finishTarget}にさらに${finishAttack}攻撃した。`);
                } else {
                    this.addLog(`${attackerName}はダウンしている${defenderName}を無理やり立たせた。`);
                    this.addLog(`戦闘再開。`);
                }

                await new Promise(resolve => setTimeout(resolve, 1000));
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
