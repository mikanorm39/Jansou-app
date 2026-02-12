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
    name: "お嬢様",
    description: "上品で高圧的な実況スタイル",
    model: {
      gptModelPath: "models/ojousama/gpt.ckpt",
      sovitsModelPath: "models/ojousama/sovits.pth",
    },
  },
  {
    id: "yankee",
    name: "ヤンキー",
    description: "勢いで押し切る熱血実況",
    model: {
      gptModelPath: "models/yankee/gpt.ckpt",
      sovitsModelPath: "models/yankee/sovits.pth",
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
