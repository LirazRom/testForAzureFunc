const rp = require('request-promise');
const _ = require('lodash');

module.exports = async function (context, myQueueItem) {
    context.log('JavaScript queue trigger function processed work item', myQueueItem);

    //const message = JSON.parse(myQueueItem);
    context.log(`got message ${typeof myQueueItem}`);

    const options = {
        uri: `${process.env["MSI_ENDPOINT"]}/?resource=https://management.azure.com&api-version=2017-09-01`,
        headers: {
            'Secret': process.env["MSI_SECRET"]
        },
        json: true
    };
    const tokenRes = await rp(options)

    const lb = await switchRule(myQueueItem.resourceGroup,
        myQueueItem.subscription,
        myQueueItem.lbName,
        myQueueItem.ruleName,
        tokenRes.access_token);

    async function getLoadBalancer(resourceGroup, subscription, loadBalancer, token) {
        const gs = {
            uri: `https://management.azure.com/subscriptions/${subscription}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/loadBalancers/${loadBalancer}?api-version=2018-02-01`,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            json: true
        }

        const lbRes = await rp(gs)
        return lbRes;
    }

    async function UpdateLoadBalancer(resourceGroup, subscription, loadBalancer, loadBalancerName, token) {
        const gs = {
            uri: `https://management.azure.com/subscriptions/${subscription}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/loadBalancers/${loadBalancerName}?api-version=2018-02-01`,
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: loadBalancer,
            json: true
        }

        const lbRes = await rp(gs)
        return lbRes;
    }


    async function switchRule(resourceGroup, subscription, loadBalancerName, ruleName, token) {

        context.log(`starting to switch rules - ${ruleName} in ${loadBalancerName}`);

        let loadBalancerObj = await getLoadBalancer(resourceGroup, subscription, loadBalancerName, token);
        const filteredRules = _.filter(loadBalancerObj.properties.loadBalancingRules, rule => {
            return rule.name !== ruleName
        });

        const allRules = _.cloneDeep(loadBalancerObj.properties.loadBalancingRules)

        //context.log(filteredRules);
        loadBalancerObj.properties.loadBalancingRules = filteredRules;
        context.log('---------------');
        // context.log(loadBalancerObj.properties.loadBalancingRules);

        context.log(`going to delete ${ruleName} in ${loadBalancerName}`);
        let withNoRuleLb = await UpdateLoadBalancer(resourceGroup, subscription, loadBalancerObj, loadBalancerName, token);

        context.log(`going to add ${ruleName} in ${loadBalancerName}`);
        loadBalancerObj.properties.loadBalancingRules = allRules;
        withNoRuleLb = await UpdateLoadBalancer(resourceGroup, subscription, loadBalancerObj, loadBalancerName, token);
    }
};