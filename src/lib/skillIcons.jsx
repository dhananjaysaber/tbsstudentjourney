import React from 'react';
import {
  Flag, Puzzle, HeartHandshake, TrendingUp, Rocket, Mountain, Globe, Scale,
  Search, BookOpen, Lightbulb, MessageCircle, ShieldCheck, DoorOpen, Zap, Leaf,
  NotebookPen, Brain, Megaphone, Users, Target, Microscope, Sparkles
} from 'lucide-react';

/* One icon per skill (approved set). Anything else — a student's own
 * skill — gets the sparkle and is marked custom. */
const ICONS = {
  leadership: Flag,
  collaboration: Puzzle,
  caring: HeartHandshake,
  perseverance: TrendingUp,
  initiative: Rocket,
  challenge: Mountain,
  'global engagement': Globe,
  'ethical choices': Scale,
  inquirer: Search,
  knowledgeable: BookOpen,
  thinker: Lightbulb,
  communicator: MessageCircle,
  principled: ShieldCheck,
  'open-minded': DoorOpen,
  'open minded': DoorOpen,
  'risk-taker': Zap,
  'risk taker': Zap,
  balanced: Leaf,
  reflective: NotebookPen,
  'thinking skills': Brain,
  'communication skills': Megaphone,
  'social skills': Users,
  'self-management': Target,
  'self management': Target,
  'research skills': Microscope
};

export function skillIcon(name) {
  const Icon = ICONS[String(name || '').trim().toLowerCase()];
  return { Icon: Icon || Sparkles, custom: !Icon };
}

export function SkillChip({ name }) {
  const { Icon, custom } = skillIcon(name);
  return (
    <span className={`skillChip${custom ? ' isCustom' : ''}`}>
      <i><Icon aria-hidden="true" /></i>
      {name}
    </span>
  );
}
