import { PermissionFlagsBits } from 'discord.js';

export function hasModPermission(member: any) {
  if (!member) return false;
  return member.permissions?.has(PermissionFlagsBits.BanMembers) || member.permissions?.has(PermissionFlagsBits.KickMembers);
}
