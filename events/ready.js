// events/ready.js
export default {
    name: 'ready',
    once: true,
    execute(client) {
        console.log(`🤖 ${client.user.tag} is online!`);
        console.log(`📊 Serving ${client.guilds.cache.size} guilds`);
        
        client.user.setActivity('🛠️ /config voor instellingen', { type: 'WATCHING' });
    },
};