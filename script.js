const HP_MAX = 100;
const DAMAGE = 10;
const TRAUMA_TURNS = 3;

const Commands = {
    GRAB: 'Grab',
    HOLD: 'Hold',
    SIDESTEP: 'Sidestep',
    HOLD_COUNTER: 'Hold Counter',
    GUARD: 'Guard'
};

const commandList = Object.values(Commands);

class Player {
    constructor(name) {
        this.name = name;
        this.hp = HP_MAX;
        this.command = null;
        this.sidestep_cd = 0;
        this.sidestep_streak = 0;
        this.hold_counter_cd = 0;
        this.trauma = 0;
        this.last_command = null;
    }

    availableCommands() {
        return commandList.filter(c => {
            if (c === Commands.SIDESTEP && this.sidestep_cd > 0) return false;
            if (c === Commands.HOLD_COUNTER && this.hold_counter_cd > 0) return false;
            if (c === Commands.HOLD && this.trauma > 0) return false;
            return true;
        });
    }
}

class Game {
    constructor() {
        this.logElem = document.getElementById('battleLog');
        this.p1 = new Player('Player 1');
        this.p2 = new Player('Player 2');
        document.getElementById('startButton').addEventListener('click', () => this.start());
    }

    log(msg) {
        this.logElem.value += msg + '\n';
        this.logElem.scrollTop = this.logElem.scrollHeight;
    }

    updateHPBars() {
        document.getElementById('p1-hp').style.width = Math.max(this.p1.hp, 0) + 'px';
        document.getElementById('p2-hp').style.width = Math.max(this.p2.hp, 0) + 'px';
    }

    randomCommand(player) {
        const options = player.availableCommands();
        return options[Math.floor(Math.random() * options.length)];
    }

    determineOutcome(c1, c2) {
        if (c1 === c2) return { winner: 0 };

        if (c1 === Commands.HOLD_COUNTER && c2 === Commands.HOLD) return { winner: 1, holdCounter: true };
        if (c2 === Commands.HOLD_COUNTER && c1 === Commands.HOLD) return { winner: 2, holdCounter: true };

        const beats = {
            [Commands.GRAB]: [Commands.GUARD],
            [Commands.HOLD]: [Commands.GRAB, Commands.GUARD],
            [Commands.SIDESTEP]: [Commands.GRAB, Commands.HOLD, Commands.HOLD_COUNTER],
            [Commands.GUARD]: [Commands.SIDESTEP, Commands.HOLD_COUNTER]
        };

        if (beats[c1] && beats[c1].includes(c2)) return { winner: 1 };
        if (beats[c2] && beats[c2].includes(c1)) return { winner: 2 };
        return { winner: 0 };
    }

    applyWinEffects(winner, loser, holdCounter) {
        let dmg = DAMAGE;
        if (holdCounter) {
            loser.trauma = TRAUMA_TURNS;
            winner.trauma = 0;
            this.log(`${winner.name} successfully Hold Countered!`);
        }
        loser.hp -= dmg;
        this.log(`${loser.name} takes ${dmg} damage (HP: ${loser.hp})`);

        if (winner.trauma > 0) {
            winner.trauma = Math.max(winner.trauma - 1, 0);
            this.log(`${winner.name}'s trauma decreases to ${winner.trauma}`);
        }
    }

    endOfTurn(player) {
        player.sidestep_cd = Math.max(player.sidestep_cd - 1, 0);
        player.hold_counter_cd = Math.max(player.hold_counter_cd - 1, 0);
        player.trauma = Math.max(player.trauma - 1, 0);
        player.last_command = player.command;
        player.command = null;
    }

    processCooldowns(player) {
        if (player.command === Commands.SIDESTEP) {
            player.sidestep_streak++;
            player.sidestep_cd = player.sidestep_streak;
        } else {
            player.sidestep_streak = 0;
        }
        if (player.command === Commands.HOLD_COUNTER) {
            player.hold_counter_cd = 1;
        }
    }

    processTurn() {
        this.p1.command = this.randomCommand(this.p1);
        this.p2.command = this.randomCommand(this.p2);
        this.log(`Turn ${this.turn}: P1 ${this.p1.command} / P2 ${this.p2.command}`);

        const res = this.determineOutcome(this.p1.command, this.p2.command);
        if (res.winner === 1) {
            this.log(`=> ${this.p1.name} wins the clash`);
            this.applyWinEffects(this.p1, this.p2, res.holdCounter);
        } else if (res.winner === 2) {
            this.log(`=> ${this.p2.name} wins the clash`);
            this.applyWinEffects(this.p2, this.p1, res.holdCounter);
        } else {
            this.log('=> tie');
        }

        this.processCooldowns(this.p1);
        this.processCooldowns(this.p2);

        this.endOfTurn(this.p1);
        this.endOfTurn(this.p2);

        this.updateHPBars();
        this.turn++;
    }

    start() {
        this.logElem.value = '';
        this.p1 = new Player('Player 1');
        this.p2 = new Player('Player 2');
        this.turn = 1;
        this.updateHPBars();

        while (this.p1.hp > 0 && this.p2.hp > 0) {
            this.processTurn();
        }

        if (this.p1.hp <= 0 && this.p2.hp <= 0) {
            this.log('Draw game');
        } else if (this.p1.hp <= 0) {
            this.log('Player 2 wins');
        } else {
            this.log('Player 1 wins');
        }
    }
}

window.addEventListener('DOMContentLoaded', () => new Game());
