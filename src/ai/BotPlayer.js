var PlayerTracker = require('../PlayerTracker');
var Vector = require('vector2-node');

function BotPlayer() {
    PlayerTracker.apply(this, Array.prototype.slice.call(arguments));
    this.splitCooldown = 0;
}
module.exports = BotPlayer;
BotPlayer.prototype = new PlayerTracker();

BotPlayer.prototype.getLowestCell = function () {
    // Gets the cell with the lowest mass
    if (this.cells.length <= 0) {
        return null; // Error!
    }
    
    // Sort the cells by Array.sort() function to avoid errors
    var sorted = this.cells.valueOf();
    sorted.sort(function (a, b) {
        return b._size - a._size;
    });
    
    return sorted[0];
};

BotPlayer.prototype.checkConnection = function () {
    if (this.socket.isCloseRequest) {
        while (this.cells.length > 0) {
            this.gameServer.removeNode(this.cells[0]);
        }
        this.isRemoved = true;
        return;
    }
    
    // Respawn if bot is dead
    if (this.cells.length <= 0) {
        this.gameServer.gameMode.onPlayerSpawn(this.gameServer, this);
        if (this.cells.length == 0) {
            // If the bot cannot spawn any cells, then disconnect it
            this.socket.close();
        }
    }
};

BotPlayer.prototype.sendUpdate = function () { // Overrides the update function from player tracker
    if (this.splitCooldown > 0) this.splitCooldown--;
    this.decide(this.getLowestCell()); // Action
};

// Custom
BotPlayer.prototype.decide = function (cell) {
    if (!cell) return; // Cell was eaten, check in the next tick (I'm too lazy)
    
    // Splitting
    var result = new Vector(0, 0);
    var split = false,
        splitTarget = null,
        threats = [];
    
    for (var i = 0; i < this.viewNodes.length; i++) {
        var check = this.viewNodes[i];
        if (check.owner == this) continue;
        
        // Get attraction of the cells - avoid larger cells, viruses and same team cells
        var influence = 0;
        if (check.cellType == 0) {
            // Player cell
            if (this.gameServer.gameMode.haveTeams && (cell.owner.team == check.owner.team)) {
                // Same team cell
                influence = 0;
            }
            else if (cell._size > (check._size) * 1.15) {
                // Can eat it
                influence = check._size * 2.5;
            }
            else if (check._size > cell._size * 1.15) {
                // Can eat me
                influence = -check._size;
            } else {
                influence = -(check._size / cell._size) / 3;
            }
        } else if (check.cellType == 1) {
            // Food
            influence = 1;
        } else if (check.cellType == 2) {
            // Virus
            if (cell._size > check._size * 1.15) {
                // Can eat it
                if (this.cells.length == this.gameServer.config.playerMaxCells) {
                    // Won't explode
                    influence = check._size * 2.5;
                }
                else {
                    // Can explode
                    influence = -1;
                }
            } else if (check.isMotherCell && check._size > cell._size * 1.15) {
                // can eat me
                influence = -1;
            }
        } else if (check.cellType == 3) {
            // Ejected mass
            if (cell._size > check._size * 1.15)
                // can eat
                influence = check._size;
        }
        
        // Apply influence if it isn't 0 or my cell
        if (influence == 0 || cell.owner == check.owner)
            continue;
        
        // Calculate separation between cell and check
        var displacement = new Vector(check.position.x - cell.position.x, check.position.y - cell.position.y);
        
        // Figure out distance between cells
        var distance = displacement.length();
        if (influence < 0) {
            // Get edge distance
            distance -= cell._size + check._size;
            if (check.cellType == 0) threats.push(check);
        }
        
        // The farther they are the smaller influnce it is
        if (distance < 1) distance = 1; // Avoid NaN and positive influence with negative distance & attraction
        influence /= distance;
        
        // Produce force vector exerted by this entity on the cell
        var force = displacement.normalize().scale(influence);
        
        // Splitting conditions
        if (check.cellType == 0 && cell._size > (check._size) * 1.15 &&
            (!split) && this.splitCooldown == 0 && this.cells.length < 8) {
            splitTarget = check;
            split = true;
        } else {
            // Add up forces on the entity
            result.add(force);
        }
    }
    // Normalize the resulting vector
    result.normalize();
    
    // Check for splitkilling and threats
    if (split) {
        // Splitkill the target
        this.mouse = {
            x: splitTarget.position.x,
            y: splitTarget.position.y
        };
        this.splitCooldown = 15;
        this.socket.packetHandler.pressSpace = true;
        return;
    }
    this.mouse = {
        x: cell.position.x + result.x * 800,
        y: cell.position.y + result.y * 800
    };
};
