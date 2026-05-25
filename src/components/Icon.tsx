import * as Lucide from 'lucide-react-native';

import { colors } from '@/lib/theme';

// Re-exportamos os ícones que usamos no app pra facilitar uso e ter
// uma "lista oficial" de ícones autorizados (evita inconsistência visual).

type IconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

const defaults = {
  size: 20,
  color: colors.text,
  strokeWidth: 2,
};

// Hack: lucide aceita props nativamente. Apenas embrulhamos pra ter defaults.
function makeIcon(LucideComp: any) {
  return function Icon(props: IconProps) {
    return (
      <LucideComp
        size={props.size ?? defaults.size}
        color={props.color ?? defaults.color}
        strokeWidth={props.strokeWidth ?? defaults.strokeWidth}
      />
    );
  };
}

// Navegação
export const ChevronLeft = makeIcon(Lucide.ChevronLeft);
export const ChevronRight = makeIcon(Lucide.ChevronRight);
export const ChevronUp = makeIcon(Lucide.ChevronUp);
export const ChevronDown = makeIcon(Lucide.ChevronDown);
export const ArrowLeft = makeIcon(Lucide.ArrowLeft);
export const ArrowRight = makeIcon(Lucide.ArrowRight);

// Ações
export const Plus = makeIcon(Lucide.Plus);
export const X = makeIcon(Lucide.X);
export const Check = makeIcon(Lucide.Check);
export const Camera = makeIcon(Lucide.Camera);
export const Clipboard = makeIcon(Lucide.Clipboard);
export const FileText = makeIcon(Lucide.FileText);
export const Image = makeIcon(Lucide.Image);
export const Trash = makeIcon(Lucide.Trash2);
export const Edit = makeIcon(Lucide.Pencil);
export const Copy = makeIcon(Lucide.Copy);
export const Share = makeIcon(Lucide.Share2);
export const Globe = makeIcon(Lucide.Globe);
export const Search = makeIcon(Lucide.Search);
export const MoreVertical = makeIcon(Lucide.MoreVertical);
export const GripVertical = makeIcon(Lucide.GripVertical);

// Domínio (viagens)
export const MapPin = makeIcon(Lucide.MapPin);
export const Calendar = makeIcon(Lucide.Calendar);
export const Clock = makeIcon(Lucide.Clock);
export const Plane = makeIcon(Lucide.Plane);
export const Compass = makeIcon(Lucide.Compass);
export const Map = makeIcon(Lucide.Map);
export const Navigation = makeIcon(Lucide.Navigation);

// Despesas / categorias
export const Wallet = makeIcon(Lucide.Wallet);
export const Receipt = makeIcon(Lucide.Receipt);
export const UtensilsCrossed = makeIcon(Lucide.UtensilsCrossed);
export const Hotel = makeIcon(Lucide.Hotel);
export const Bed = makeIcon(Lucide.Bed);
export const House = makeIcon(Lucide.House);
export const Building = makeIcon(Lucide.Building);
export const Tent = makeIcon(Lucide.Tent);
export const MoreHorizontal = makeIcon(Lucide.Ellipsis);
export const KeyRound = makeIcon(Lucide.KeyRound);
export const Car = makeIcon(Lucide.Car);
export const Ticket = makeIcon(Lucide.Ticket);
export const ShoppingBag = makeIcon(Lucide.ShoppingBag);
export const Coffee = makeIcon(Lucide.Coffee);
export const Trees = makeIcon(Lucide.Trees);
export const Utensils = makeIcon(Lucide.Utensils);
export const DollarSign = makeIcon(Lucide.DollarSign);

// Tarefas
export const ListChecks = makeIcon(Lucide.ListChecks);
export const CircleCheck = makeIcon(Lucide.CircleCheck);
export const CircleAlert = makeIcon(Lucide.CircleAlert);

// Pessoas
export const User = makeIcon(Lucide.User);
export const Users = makeIcon(Lucide.Users);
export const UserPlus = makeIcon(Lucide.UserPlus);

// Sistema
export const Settings = makeIcon(Lucide.Settings);
export const LogOut = makeIcon(Lucide.LogOut);
export const Loader = makeIcon(Lucide.Loader);
export const RefreshCw = makeIcon(Lucide.RefreshCw);
export const CloudOff = makeIcon(Lucide.CloudOff);
export const AlertTriangle = makeIcon(Lucide.AlertTriangle);
export const Database = makeIcon(Lucide.Database);
export const ExternalLink = makeIcon(Lucide.ExternalLink);
export const Link = makeIcon(Lucide.Link);
export const Trash2 = makeIcon(Lucide.Trash2);
export const MessageCircle = makeIcon(Lucide.MessageCircle);
export const Moon = makeIcon(Lucide.Moon);
export const Route = makeIcon(Lucide.Route);
export const Smartphone = makeIcon(Lucide.Smartphone);
export const Sun = makeIcon(Lucide.Sun);
export const Sunrise = makeIcon(Lucide.Sunrise);
export const Sunset = makeIcon(Lucide.Sunset);
export const Sparkles = makeIcon(Lucide.Sparkles);
export const Tag = makeIcon(Lucide.Tag);
export const Gift = makeIcon(Lucide.Gift);
export const Music = makeIcon(Lucide.Music);
export const Heart = makeIcon(Lucide.Heart);
export const Fuel = makeIcon(Lucide.Fuel);
export const Dumbbell = makeIcon(Lucide.Dumbbell);
export const Bell = makeIcon(Lucide.Bell);
export const BellRing = makeIcon(Lucide.BellRing);
export const ArrowDown = makeIcon(Lucide.ArrowDown);
export const ArrowUpDown = makeIcon(Lucide.ArrowUpDown);
export const Calculator = makeIcon(Lucide.Calculator);
export const BellOff = makeIcon(Lucide.BellOff);
export const Lock = makeIcon(Lucide.Lock);
export const Phone = makeIcon(Lucide.Phone);
export const Star = makeIcon(Lucide.Star);
export const Wifi = makeIcon(Lucide.Wifi);
export const BarChart2 = makeIcon(Lucide.BarChart2);
export const SlidersHorizontal = makeIcon(Lucide.SlidersHorizontal);
export const Filter = makeIcon(Lucide.Filter);
export const QrCode = makeIcon(Lucide.QrCode);
export const Send = makeIcon(Lucide.Send);
export const Download = makeIcon(Lucide.Download);
export const Backpack = makeIcon(Lucide.Backpack);
