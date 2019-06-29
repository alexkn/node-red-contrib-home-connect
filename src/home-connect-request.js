module.exports = function (RED) {
    const SwaggerClient = require('swagger-client');

    function Request(config) {
        RED.nodes.createNode(this, config);

        this.auth = RED.nodes.getNode(config.auth);
        this.name = config.name;
        this.tag = config.tag;
        this.operationId = config.operationId;
        this.haid = config.haid;
        this.optionkey = config.optionkey;
        this.programkey = config.programkey;
        this.settingkey = config.settingkey;
        this.statuskey = config.statuskey;
        this.imagekey = config.imagekey;
        this.body = config.body;

        const urls = {
            simulation: 'https://apiclient.home-connect.com/hcsdk.yaml',
            production: 'https://apiclient.home-connect.com/hcsdk-production.yaml'
        }

        this.status({ fill: 'red', shape: 'ring', text: 'not connected' });

        const node = this;

        node.auth.on('home-connect-auth', () => {
            node.getSwaggerClient();
        });

        node.on('input', msg => {
            if(!node.client) {
                node.error('auth not ready');
                return;
            }

            node.client.apis[node.tag][node.operationId]({
                haid: node.haid,
                body: node.body,
                optionkey: node.optionkey,
                programkey: node.programkey,
                statuskey: node.statuskey,
                imagekey: node.imagekey,
                settingkey: node.settingkey
            })
            .then(response => {
                let res = response.data;
                try {
                    res = JSON.parse(res);
                } catch (error) {}
                node.send({
                    payload: res
                });
            })
            .catch(error => {
                node.send({
                    error: error
                });
            });
        });

        node.getSwaggerClient = () => {
            if (node.auth.access_token != undefined) {
                SwaggerClient({
                    url: node.auth.simulation_mode ? urls.simulation : urls.production,
                    requestInterceptor: req => {
                        req.headers['accept'] = 'application/vnd.bsh.sdk.v1+json, image/jpeg',
                        req.headers['authorization'] = 'Bearer ' + node.auth.access_token
                    }
                })
                .then(client => {
                    node.client = client;
                    node.status({ fill: 'green', shape: 'dot', text: 'ready' });
                })
                .catch(error => {
                    console.log(error);
                });
            }
        };
    }
    RED.nodes.registerType('Request', Request);
};