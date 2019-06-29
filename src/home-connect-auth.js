module.exports = function (RED) {
    const request = require('request');
    const fs = require('fs');

    function OAuth2(config) {
        RED.nodes.createNode(this, config);

        this.name = config.name;
        this.simulation_mode = config.simulation_mode;
        this.client_id = this.credentials.client_id;
        this.client_secret = this.credentials.client_secret;
        this.access_token = null;

        const node = this;

        node.getHost = () => {
            return getHost(node.simulation_mode);
        }

        node.refreshTokens = () => {
            request.post({
                headers: {'content-type' : 'application/x-www-form-urlencoded'},
                url: node.getHost() + '/security/oauth/token',
                body: 'grant_type=refresh_token&client_secret=' + node.client_secret + '&refresh_token=' + node.tokens.refresh_token
            }, (error, response, body) => {
                if (error || response.statusCode != 200) {
                    node.error('refreshTokens failed: ' + body);
                    return;
                }

                node.tokens = { ...JSON.parse(body), timestamp: Date.now() };

                writeTokenFile(node.tokens, (err) => {
                    if (err) {
                        node.error(err);
                    }
                });

                node.access_token = node.tokens.access_token;
                node.emit('home-connect-auth');
            });
        };

        node.loadTokenFile = () => {
            try {
                let path = RED.settings.userDir + '/homeconnect_tokens.json';
                if (fs.existsSync(path)) {
                    let content = fs.readFileSync(path, 'utf8');
                    node.tokens = JSON.parse(content);
    
                    if (node.tokens != undefined) {
                        node.refreshTokens();
                    }
                }
            } catch (err) {
                node.error(err);
            }
        };

        RED.events.on("nodes-started", () => {
            node.loadTokenFile();
        });
    }
    RED.nodes.registerType('OAuth2', OAuth2, {
        credentials: {
            client_id: { type: 'text' },
            client_secret: { type: 'text' }
        }
    });

    let getHost = (simulation_mode) => {
        if(simulation_mode) {
            return 'https://simulator.home-connect.com';
        } else {
            return 'https://api.home-connect.com';
        }
    }

    let writeTokenFile = (tokens, callback) => {
        fs.writeFile(RED.settings.userDir + '/homeconnect_tokens.json', JSON.stringify(tokens), callback);
    }

    let runningAuth = null;

    RED.httpAdmin.get('/homeconnect/auth/start', (req, res) => {
        runningAuth = {
            node_id: req.query.node_id,
            client_id: req.query.client_id,
            client_secret: req.query.client_secret,
            callback_url: req.protocol + '://' + req.get('host') + '/homeconnect/auth/callback',
            simulation_mode: (req.query.simulation_mode == 'true')
        };

        const url = getHost(runningAuth.simulation_mode) + '/security/oauth/authorize' + '?client_id=' + runningAuth.client_id + '&response_type=code&redirect_uri=' + runningAuth.callback_url;

        res.send({
            'url': url
        });
    });

    RED.httpAdmin.get('/homeconnect/auth/callback', (req, res) => {
        if (!runningAuth) {
            res.sendStatus(400);
            return;
        }

        let node = RED.nodes.getNode(runningAuth.node_id);

        let authCode = req.query.code;

        request.post({
            headers: {'content-type' : 'application/x-www-form-urlencoded'},
            url: getHost(runningAuth.simulation_mode) + '/security/oauth/token',
            body: 'client_id=' + runningAuth.client_id + 
                '&client_secret=' + runningAuth.client_secret + 
                '&grant_type=authorization_code&code=' + authCode +
                '&redirect_uri=' + runningAuth.callback_url
        }, (error, response, body) => {

            if (error || response.statusCode != 200) {
                node.error('getTokens failed: ' + body);
                return;
            }

            node.tokens = { ...JSON.parse(body), timestamp: Date.now() };

            writeTokenFile(node.tokens, (err) => {
                if (err) {
                    node.error(err);
                }
            });

            node.access_token = node.tokens.access_token;
            node.emit('home-connect-auth');
        });

        runningAuth = null;
        res.sendStatus(200);
    });
}