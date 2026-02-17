export type VoiceCharacter = {
  id: string;
  name: string;
  description: string;
  model: {
    gptModelPath?: string;
    sovitsModelPath?: string;
  };
};

export const characters: VoiceCharacter[] = [
  {
    id: "ojousama",
    name: "ずんだもん",
    description: "ずんだもんボイスで実況する",
    model: {
      gptModelPath: "models/ojousama/gpt.ckpt",
      sovitsModelPath: "models/ojousama/sovits.pth",
    },
  },
  {
    id: "yankee",
    name: "カイジR",
    description: "カイジR風の圧がある実況",
    model: {
      gptModelPath: "models/robo/gpt.ckpt",
      sovitsModelPath: "models/robo/sovits.pth",
    },
  },
  {
    id: "datsuryoku",
    name: "脱力系",
    description: "ゆるく淡々とした実況",
    model: {
      gptModelPath: "models/datsuryoku/gpt.ckpt",
      sovitsModelPath: "models/datsuryoku/sovits.pth",
    },
  },
];
