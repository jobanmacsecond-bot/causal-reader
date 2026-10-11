// Run explicitly for Render or a configured local HTTPS tunnel; server.mjs stays loopback-only.
import {createHostedServer,readHostedConfig} from './lib/hosted-server.mjs';

const config=readHostedConfig();
const server=await createHostedServer({publicOrigin:config.publicOrigin});
server.listen(config.port,config.host,()=>console.log(`Causal hosted reader: ${config.publicOrigin} (listening on ${config.host}:${config.port})`));
function shutdown(){
 server.close(()=>process.exit(0));
 server.closeIdleConnections();
 const deadline=setTimeout(()=>{server.closeAllConnections();process.exit(0);},10000);deadline.unref();
}
process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);
