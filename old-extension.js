const discord_rpc = require("discord-rpc");
const path = require("path");
const timers = require("timers");
const vscode = require("vscode");

let rpc, eventHandler, config, reconnect, reconnectCounter = 0, lastKnownFileName;

function activate(context) {
    config = vscode.workspace.getConfiguration('discord');
    
    if (config.get('enabled')) initRPC(config.get('clientID'));

    const enabler = vscode.commands.registerCommand('discord.enable', () => {
        if (rpc) destroyRPC();

        config.update('enabled', true);

        initRPC(config.get('clientID'));
        
        vscode.window.showInformationMessage('Enabled Discord Rich Presence for this workspace.');
    });
    
    const disabler = vscode.commands.registerCommand('discord.disable', () => {
        if (!rpc) return;

        config.update('enabled', false);

        rpc.setActivity({});

        destroyRPC();
        
        vscode.window.showInformationMessage('Disabled Discord Rich Presence for this workspace.');
    });
    
    context.subscriptions.push(enabler, disabler);
}

function deactivate(context) { destroyRPC(); }

function initRPC(clientID) {
    rpc = new discord_rpc.Client({ transport: 'ipc' });
    
    rpc.once('ready', () => {
        if (reconnect) {
            timers.clearInterval(reconnect);
            reconnect = null;
        }
        
        reconnectCounter = 0;

        setActivity();

        eventHandler = vscode.workspace.onDidChangeTextDocument((e) => setActivity());
        
        rpc.transport.once('close', () => {
            if (!config.get('enabled')) return;
           
            destroyRPC();
            
            reconnect = timers.setInterval(() => {
                reconnectCounter++;

                initRPC(config.get('clientID'));
            }, 5000);
        });
    });
    
    rpc.login(clientID).catch(error => {
        if (reconnect) {
            if (reconnectCounter >= config.get('reconnectThreshold')) destroyRPC();
            else return;
        }

        if (error.message.includes('ENOENT')) vscode.window.showErrorMessage('No Discord Client detected!');
        else vscode.window.showErrorMessage(`Couldn't connect to discord via rpc: ${error.message}`);
    });
}

function destroyRPC() {
    if (!rpc) return;
    
    if (reconnect) timers.clearInterval(reconnect);
    
    reconnect = null;
    
    eventHandler.dispose();
    
    rpc.destroy();
    
    rpc = null;
    
    lastKnownFileName = null;
}

function language(id, check = false) {
    const languages = { "javascript": "JavaScript", "html": "HTML", "css": "CSS", "json": "JSON" };

    return check ? !!languages[id] : (languages[id] ? `Working in ${languages[id]}` : "Unsupported Language");
}

function hasLanguage(ext) { return ["js", "html", "css", "json", "ejs"].includes(ext); }

function setActivity() {
    if (!rpc) return;
    if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.fileName === lastKnownFileName) return;

    lastKnownFileName = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.document.fileName : null;

    const details = vscode.window.activeTextEditor
        ? config.get('details').replace('{filename}', path.basename(vscode.window.activeTextEditor.document.fileName))
        : config.get('detailsIdle');
    const checkState = vscode.window.activeTextEditor
        ? Boolean(vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri))
        : false;
    const state = vscode.window.activeTextEditor
        ? checkState
            ? config.get('workspace').replace('{workspace}', vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri).name)
            : config.get('workspaceNotFound')
        : config.get('workspaceIdle');
    
    const largeImageText = vscode.window.activeTextEditor ? config.get('largeImage') || language(vscode.window.activeTextEditor.document.languageId) : config.get('largeImageIdle');
   
    const ext = vscode.window.activeTextEditor ? path.extname(path.basename(vscode.window.activeTextEditor.document.fileName)).substring(1) || path.basename(vscode.window.activeTextEditor.document.fileName).substring(1) : null;
    const largeImageKey = vscode.window.activeTextEditor ? hasLanguage(ext) ? ext : "file" : "vsc-large";

    const activity = {
        details,
        state,
        startTimestamp: Date.now() / 1000,
        largeImageKey,
        largeImageText,
        smallImageKey: 'vsc',
        smallImageText: config.get('smallImage'),
        instance: false
    };
    
    rpc.setActivity(activity);
}

exports.activate = activate;
exports.deactivate = deactivate;