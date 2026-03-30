import "dotenv/config";
// import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
const modelName = 'gemini-3-flash-preview'

if (!apiKey) {
  throw new Error(
    "Missing GEMINI_API_KEY. Set it in .env or export it in your shell.",
  );
}

const ai = new GoogleGenAI({ apiKey });

async function main() {
  const response = await ai.models.generateContent({
    model: modelName,
    contents: "Can you explain why apples are red?",
  });
  console.log(response.text);
}

await main();

/*

Response:
The reason apples are red is a combination of chemistry, biology, and evolution. It involves a specific pigment, the influence of the sun, and a clever survival strategy.

Here is the breakdown of why apples are red:

### 1. The Chemical Reason: Anthocyanins
The primary reason an apple looks red is a group of pigments called **anthocyanins**. These are the same natural pigments that give blueberries their blue and raspberries their red.

*   **Chlorophyll first:** When apples are young, they are full of chlorophyll, which makes them green. This allows the fruit to photosynthesize and grow.
*   **The transition:** As the apple ripens, the chlorophyll breaks down. In many varieties, the DNA of the apple then triggers the production of anthocyanins in the skin.

### 2. The Environmental Trigger: Sunlight and Temperature
Apple trees don't just turn red automatically; they usually need a "cue" from the environment.
*   **Light:** Anthocyanin production is heavily dependent on light. This is why you might find an apple that is bright red on one side but green on the side that was shaded by a leaf.
*   **Temperature:** Cool nights followed by bright, sunny days in the autumn are the perfect conditions for creating deep red apples. The cold prevents the sugars from leaving the fruit, and the sun uses those sugars to create more red pigment.

### 3. The Evolutionary Reason: "Eat Me!"
Plants don't do things by accident; there is almost always a survival benefit.
*   **Seed Dispersal:** An apple tree wants its seeds to be spread far away so its offspring don't compete for the same soil. To do this, it needs animals to eat the fruit and "deposit" the seeds elsewhere.
*   **The Signal:** A bright red apple stands out vividly against green leaves. To a bird or a mammal, red is a visual "signal" that the fruit is ripe, sweet, and full of energy (sugar). Green fruit usually tastes bitter or sour, telling animals to stay away until the seeds are ready.

### 4. Human Influence (Artificial Selection)
While wild apples come in many colors, the apples you see in the grocery store are exceptionally red because of humans.
*   For centuries, farmers have practiced **selective breeding**. When a farmer noticed a tree produced particularly red, beautiful apples, they would take a graft from that tree to grow more just like it.
*   Because consumers tend to associate the color red with sweetness and health, growers have prioritized "redder" varieties like the Red Delicious or Gala.

### Why are some apples green or yellow?
Not all apples have the genetic "code" to produce anthocyanins.
*   **Granny Smith** apples stay green because they maintain high levels of chlorophyll even when they are fully ripe.
*   **Golden Delicious** apples produce **carotenoids** (the same pigments in carrots), which give them a yellow or golden hue instead of red.

*/