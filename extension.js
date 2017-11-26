const { Client } = require("discord-rpc");
const path = require("path");
const { createInterval, removeInterval } = require("timers");
const { workspace, commands, window } = require("vscode");

const languages = require("./languages");

let rpc, reconnect, reconnectAttempts, config, lastKnownFileName;

function activate(context) {
    config = workspace.getConfiguration("discordrp");

    if (config.get("enabled")) rpc = new RPC(config.get("clientID"));

    context.subscriptions.push(
        commands.registerCommand("discordrp.enable", () => {
            if (rpc) rpc.destroy();

            config.update("enabled", true);

            rpc = new RPC(config.get("clientID"));

            window.shotInformationMessage("Discord Rich Presense is now enabled.");
        }),
        commands.registerCommand("discordrp.disable", () => {
            if (!rpc) return;

            config.update("enabled", false);

            rpc.clearActivity();
            rpc.destroy();

            window.shotInformationMessage("Discord Rich Presense is now disabled.");
        })
    );
}

function deactivate(context) {
    if (rpc) rpc.destroy();
}

exports.activate = activate;
exports.deactivate = deactivate;

class RPC extends Client {
    constructor(clientID) {
        super({ transport: "ipc" });

        this.eventHandler;

        this.once("ready", () => {
            if (reconnect) {
                removeInterval(reconnect);
                reconnect = null;
            }

            reconnectAttempts = 0;

            this.setActivity();

            this.eventHandler = workspace.onDidChangeTextDocument(() => this.setActivity());
            
            this.transport.once("close", () => {
                if (!config.get("enabled")) return;

                this.destroy();

                reconnect = createInterval(() => {
                    reconnectAttempts++;

                    rpc = new RPC(config.get("clientID"));
                }, 5000);
            });
        });

        this.login(clientID).catch(err => {
            if (reconnect && reconnectAttempts >= config.get("reconnectThreshold")) this.destroy();

            if (err.message.includes("ENOENT")) return window.showErrorMessage("A Discord Client cannot be detected.");
            window.showErrorMessage(`An error occured while trying to connected to Discord via RPC: ${err.message}`);
        });
    }

    destroy() {
        if (!rpc) return;
        
        if (reconnect) removeInterval(reconnect);

        reconnect = null;

        this.eventHandler.dispose();

        super.destroy();

        rpc = null;
        
        lastKnownFileName = null;
    }

    language(ext) {
        return languages[ext];
    }

    setActivity() {
        if (!rpc) return;
        if (window.activeTextEditor && window.activeTextEditor.document.fileName === lastKnownFileName) return;

        let activity;

        if (window.activeTextEditor) {
            lastKnownFileName = window.activeTextEditor.document.fileName;

            const details = config.get("details").replace("{filename}", path.basename(window.activeTextEditor.document.fileName));

            const checkState = !!workspace.getWorkspaceFolder(window.activeTextEditor.document.uri);

            const state = checkState ?
                config.get("workspace").replace("{workspace}", workspace.getWorkspaceFolder(window.activeTextEditor.document.uri).name) :
                config.get("workspaceNotFound");

            const ext = path.extname(path.basename(window.activeTextEditor.document.fileName)).substring(1) || path.basename(window.activeTextEditor.document.fileName).substring(1);
            const lang = this.language(ext) || { "title": "Unsupported Language", "key": "file" };
         
            activity = {
                details,
                state,
                startTimestamp: Date.now() / 1000,
                largeImageKey: lang.key,
                largeImageText: lang.title,
                smallImageKey: "vsc",
                smallImageText: config.get("smallImage"),
                instance: false
            };
        } else {
            const details = config.get("detailsIdle");
            const checkState = false;
            const state = config.get("workspaceIdle");

            activity = {
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
        
        super.setActivity(activity);
    }

    clearActivity() {
        return super.setActivity({});
    }
}