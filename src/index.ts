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

const flowDesmutearBot = BotWhatsapp.addKeyword('finalizar')
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

const flowSaludo = BotWhatsapp.addKeyword(['hola, buenos dias, buenas '])
 .addAnswer('🙌 ¡Bienvenido! Soy tu asistente virtual de *WAO Internet*. Gracias por comunicarte con nosotros')
 .addAnswer('¡En que puedo ayudarte?')


  const FlujoPrincipal = BotWhatsapp.addKeyword(['estado'])
  
  .addAction(async (ctx, { flowDynamic, state }) => {
    const numeroCliente = ctx.from;

    const clienteEnArray = clientes.find((cliente) => cliente.numero === numeroCliente);

    if (clienteEnArray) {
      console.log(`[FlujoPrincipal] Estado actual del cliente ${numeroCliente}: ${clienteEnArray.condicion}`);

      if (clienteEnArray.condicion === 'off') {
        console.log(`[FlujoPrincipal] El cliente ${numeroCliente} está muteado. Intentando desmutear...`);
        quitarMuteCliente(numeroCliente); // Intenta desmutear al cliente
        console.log(`[FlujoPrincipal] Cliente ${numeroCliente} desmuteado.`);

        // Respuesta al desmutear al cliente
        return `¡Hola! Te hemos desmuteado. ¿En qué podemos ayudarte hoy?`;
      }
    }

    console.log(`[FlujoPrincipal] Ejecutar menú correspondiente para el cliente ${numeroCliente}.`);

   
    return `¡Hola! ¿En qué podemos ayudarte hoy?`;
  });


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

const quitarMuteCliente = (numeroCliente: string) => {
  const index = clientes.findIndex((cliente) => cliente.numero === numeroCliente);

  if (index !== -1) {
    clientes[index].condicion = 'on';
    console.log(`Cliente ${numeroCliente} desmuteado.`);
  } else {
    console.log(`El cliente ${numeroCliente} no está en el array.`);
  }
};

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

const main = async () => {

  await BotWhatsapp.createBot({
    database,
    provider,
    flow: BotWhatsapp.createFlow([FlujoPrincipal, flowBienvenida, flowMute, flowDesmutearBot]),
  });
};

main(); 