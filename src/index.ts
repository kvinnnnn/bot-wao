import "dotenv/config";
import BotWhatsapp, { addKeyword } from '@bot-whatsapp/bot';
import database from './database';
import provider from './provider';
import { ChatCompletionMessageParam } from 'openai/resources';
import { run } from './services/openai';

interface ClienteInfo {
  numero: string;
  condicion: 'on' | 'off';
}

const clientes: ClienteInfo[] = [];


// Flujo principal
const FlujoPrincipal = BotWhatsapp.addKeyword(['hola', 'buenas', 'buenos dias'])
.addAction(async (ctx, { flowDynamic, state }) => {
  const numeroCliente = ctx.from;

    const clienteEnArray = clientes.find((cliente) => cliente.numero === numeroCliente);
    
    if (clienteEnArray) {
      console.log(`[FlujoPrincipal] Estado actual del cliente ${numeroCliente}: ${clienteEnArray.condicion}`);
      
      if (clienteEnArray.condicion === 'off') {
        console.log(`[FlujoPrincipal] El cliente ${numeroCliente} está muteado. Intentando desmutear...`);
        quitarMuteCliente(numeroCliente); // Intenta desmutear al cliente
        console.log(`[FlujoPrincipal] Cliente ${numeroCliente} desmuteado.`);
        return;
      }
    }
    
    console.log(`[FlujoPrincipal] Ejecutar menú correspondiente para el cliente ${numeroCliente}.`);
  });
  
// Flujo para el evento de bienvenida
const flowBienvenida = BotWhatsapp.addKeyword(BotWhatsapp.EVENTS.WELCOME)
  .addAction(async (ctx, { flowDynamic, state }) => {
     try {
      const newHistory = (state.getMyState()?.history ?? []) as ChatCompletionMessageParam[];
      const name = ctx?.pushName ?? '';
  
        console.log(`[flowBienvenida][HISTORY]`, newHistory);
        newHistory.push({
          role: 'user',
          content: ctx.body
        });
  
        const numeroCliente = ctx.from;
        const clienteEnArray = clientes.find((cliente) => cliente.numero === numeroCliente);
  
        console.log(`[flowBienvenida] Estado actual del cliente ${numeroCliente}: ${clienteEnArray?.condicion}`);
  
        if (clienteEnArray && clienteEnArray.condicion === 'off') {
          console.log(`[flowBienvenida] El cliente ${numeroCliente} está muteado. No generar respuesta de OpenAI.`);
          return;
        }
  
        const ai = await manejarRespuestaOpenAI(name, newHistory);
  
        const chunks = ai.split(/(?<!\d)\.\s+/g);
        for (const chunk of chunks) {
          await flowDynamic(chunk);
        }
  
        newHistory.push({
          role: 'assistant',
          content: ai
        });
  
        await state.update({ history: newHistory });
      } catch (err) {
        console.log(`[flowBienvenida][ERROR]:`, err);
      }
    });

// Flujo para muteo de clientes
const flowMute = BotWhatsapp.addKeyword('asesor')
  .addAction(async (ctx, { state }) => {
    const numeroCliente = ctx.from;
      
    const clienteEnArray = clientes.find((cliente) => cliente.numero === numeroCliente && cliente.condicion === 'off');
      
      if (clienteEnArray) {
        console.log(`[MUTEO] El cliente ${numeroCliente} ya está muteado.`);
        return;
      }

      const index = clientes.findIndex((cliente) => cliente.numero === numeroCliente);

      if (index !== -1) {
      clientes[index].condicion = 'off';
      console.log(`[MUTEO] Cliente ${numeroCliente} muteado temporalmente.`);
    } else {
      clientes.push({ numero: numeroCliente, condicion: 'off' });
      console.log(`[MUTEO] Cliente ${numeroCliente} añadido al array y muteado temporalmente.`);
    }
  });
  // Flujo para desmutear con palabra clave "bot"
  const flowDesmutearBot = BotWhatsapp.addKeyword('bot')
    .addAction(async (ctx, { state }) => {
      const numeroCliente = ctx.from;
    
      const clienteEnArray = clientes.find((cliente) => cliente.numero === numeroCliente && cliente.condicion === 'off');
    
        if (clienteEnArray) {
          quitarMuteCliente(numeroCliente);
          console.log(`[DES-MUTEO] Cliente ${numeroCliente} desmuteado por palabra clave "bot".`);
        } else {
          console.log(`[DES-MUTEO] El cliente ${numeroCliente} no está muteado o la palabra clave no es válida.`);
        }
      });
  
  // Función para quitar el mute a un cliente
const quitarMuteCliente = (numeroCliente: string) => {
  const index = clientes.findIndex((cliente) => cliente.numero === numeroCliente);

  if (index !== -1) {
    clientes[index].condicion = 'on';
    console.log(`Cliente ${numeroCliente} desmuteado.`);
  } else {
    console.log(`El cliente ${numeroCliente} no está en el array.`);
  }
};

// Función para manejar la respuesta de OpenAI
const manejarRespuestaOpenAI = async (name: string, history: ChatCompletionMessageParam[]) => {
  const numeroCliente = history[0].role === 'user' ? history[0].content : '';
  const clienteEnArray = clientes.find((cliente) => cliente.numero === numeroCliente && cliente.condicion === 'off');

  if (clienteEnArray) {
    console.log(`El cliente ${numeroCliente} está muteado. No generar respuesta de OpenAI.`);
    return '';
  }

  try {
    const ai = await run(name, history);
    console.log('Respuesta de OpenAI generada:', ai);
    return ai;
  } catch (err) {
    console.log('[ERROR]:', err);
    return '';
  }
};

// Función principal
const main = async () => {

  // Crear y configurar el bot de WhatsApp
  await BotWhatsapp.createBot({
    database,
    provider,
    flow: BotWhatsapp.createFlow([FlujoPrincipal, flowBienvenida, flowMute, flowDesmutearBot]),
  });
};

// Iniciar la ejecución del programa
main();
