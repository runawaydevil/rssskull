import type { Chat, ChatSettings, Feed, Prisma, Statistic } from '@prisma/client';
import { AbstractRepository } from './base.repository.js';

export type ChatWithRelations = Chat & {
  settings?: ChatSettings | null;
  feeds?: Feed[];
  statistics?: Statistic[];
};

export type CreateChatInput = Prisma.ChatCreateInput;
export type UpdateChatInput = Prisma.ChatUpdateInput;

export class ChatRepository extends AbstractRepository<
  ChatWithRelations,
  CreateChatInput,
  UpdateChatInput
> {
  async findById(id: string): Promise<ChatWithRelations | null> {
    return this.prisma.chat.findUnique({
      where: { id },
      include: {
        settings: true,
        feeds: {
          include: {
            filters: true,
          },
        },
        statistics: true,
      },
    });
  }

  async findMany(where?: Prisma.ChatWhereInput): Promise<ChatWithRelations[]> {
    return this.prisma.chat.findMany({
      where,
      include: {
        settings: true,
        feeds: {
          include: {
            filters: true,
          },
        },
        statistics: true,
      },
    });
  }

  async create(data: CreateChatInput): Promise<ChatWithRelations> {
    return this.prisma.chat.create({
      data,
      include: {
        settings: true,
        feeds: {
          include: {
            filters: true,
          },
        },
        statistics: true,
      },
    });
  }

  async update(id: string, data: UpdateChatInput): Promise<ChatWithRelations> {
    return this.prisma.chat.update({
      where: { id },
      data,
      include: {
        settings: true,
        feeds: {
          include: {
            filters: true,
          },
        },
        statistics: true,
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.chat.delete({
      where: { id },
    });
  }

  async findByIdWithSettings(
    id: string
  ): Promise<(Chat & { settings?: ChatSettings | null }) | null> {
    return this.prisma.chat.findUnique({
      where: { id },
      include: {
        settings: true,
      },
    });
  }

  async createWithSettings(
    chatData: Omit<CreateChatInput, 'settings'>,
    settingsData?: Prisma.ChatSettingsCreateInput
  ): Promise<ChatWithRelations> {
    return this.prisma.chat.create({
      data: {
        ...chatData,
        settings: settingsData
          ? {
              create: settingsData,
            }
          : undefined,
      },
      include: {
        settings: true,
        feeds: {
          include: {
            filters: true,
          },
        },
        statistics: true,
      },
    });
  }

  async upsert(args: {
    where: Prisma.ChatWhereUniqueInput;
    create: CreateChatInput;
    update: UpdateChatInput;
  }): Promise<ChatWithRelations> {
    return this.prisma.chat.upsert({
      where: args.where,
      create: args.create,
      update: args.update,
      include: {
        settings: true,
        feeds: {
          include: {
            filters: true,
          },
        },
        statistics: true,
      },
    });
  }

  async updateSettings(
    chatId: string,
    settingsData: Prisma.ChatSettingsUpdateInput
  ): Promise<ChatSettings> {
    return this.prisma.chatSettings.upsert({
      where: { chatId },
      create: {
        ...(settingsData as Prisma.ChatSettingsUncheckedCreateInput),
        chatId,
      },
      update: settingsData,
    });
  }
}
