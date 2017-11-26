const { Client } = require("discord-client");
const { extname, basename } = require("path");
const { workspace, commands, window, StatusBarAlignment } = require("vscode");

const languages = require("./languages");

let client, config;

function activate(context) {
    config = workspace.getConfiguration("discordrp");

    if (config.get("enabled")) client = new RPC(config.get("clientID"));

    context.subscriptions.push(
        commands.registerCommand("discordrp.enable", () => {
            if (client) client.destroy();

            config.update("enabled", true);

            client = new RPC(config.get("clientID"));

            window.showInformationMessage("Discord Rich Presense is now enabled.");
        }),
        commands.registerCommand("discordrp.disable", () => {
            if (!client) return;

            config.update("enabled", false);

            client.destroy();

            window.showInformationMessage("Discord Rich Presense is now disabled.");
        })
    );
}

function deactivate(context) {
    if (client) client.destroy();
}

exports.activate = activate;
exports.deactivate = deactivate;

class RPC extends Client {
    constructor(clientID) {
        super({ transport: "ipc" });

        this.eventHandler;
        this.statusBarItem;

        this.reconnect = null;
        this.reconnectionAttempts = 0;

        this.lastFile = null;

        this.once("ready", () => {
            if (this.reconnect) { clearInterval(this.reconnect); this.reconnect = null; }

            this.reconnectionAttempts = 0;

            this.setActivity();
            
            this.eventHandler = workspace.onDidChangeTextDocument(() => this.setActivity());

            this.statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left);

            this.statusBarItem.text = config.get("statusBarText");
            this.statusBarItem.show();
            
            this.transport.once("close", () => {
                if (!config.get("enabled")) return;

                this.destroy();

                this.reconnect = setInterval(() => {
                    this.reconnectionAttempts++;

                    client = new RPC(config.get("clientID"));
                }, 5000);
            });
        });

        this.login(clientID).catch(err => {
            if (this.reconnect && this.reconnectionAttempts >= config.get("reconnectThreshold")) this.destroy();

            if (err.message.includes("ENOENT")) return window.showErrorMessage("A Discord Client cannot be detected.");
            window.showErrorMessage(`An error occured while trying to connected to Discord via RPC: ${err.message}`);
        });
    }

    destroy() {
        client = null;
        
        if (this.reconnect) clearInterval(this.reconnect);
        
        this.clearActivity();

        this.eventHandler.dispose();

        this.statusBarItem.dispose();

        super.destroy();
    }

    setActivity() {
        if (window.activeTextEditor && window.activeTextEditor.document.fileName === this.lastFile) return;

        let data;

        if (window.activeTextEditor) {
            this.lastFile = window.activeTextEditor.document.fileName;

            const details = config.get("details").replace("{file}", basename(window.activeTextEditor.document.fileName));
            const checkState = !!workspace.getWorkspaceFolder(window.activeTextEditor.document.uri);
            const state = checkState ? config.get("workspace").replace("{workspace}", workspace.getWorkspaceFolder(window.activeTextEditor.document.uri).name) : config.get("workspaceNotFound");

            const ext = extname(basename(window.activeTextEditor.document.fileName)).substring(1) || basename(window.activeTextEditor.document.fileName).substring(1);
            const lang = languages[ext] || { "title": "Unsupported Language", "key": "file" };
         
            data = {
                details,
                state,
                startTimestamp: Date.now() / 1000,
                largeImageKey: lang.key,
                largeImageText: config.get("largeImage").replace("{language}", lang.title),
                smallImageKey: "vsc",
                smallImageText: config.get("smallImage"),
                instance: false
            };
        } else {
            const details = config.get("detailsIdle");
            const checkState = false;
            const state = config.get("workspaceIdle");

            data = {
                details,
                state,
                startTimestamp: Date.now() / 1000,
                largeImageKey: "vsc-large",
                largeImageText: config.get("largeImageIdle"),
                smallImageKey: "vsc",
                smallImageText: config.get("smallImage"),
                instance: false
            };
        }
        
        super.setActivity(data);
    }

    clearActivity() {
        super.setActivity({});
    }
}
