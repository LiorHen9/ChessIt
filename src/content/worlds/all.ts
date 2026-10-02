// Every world of the learning path, in order. Loaded lazily (see loadContent in ../index.ts),
// so the content is not part of the first download. To add a world: add its JSON and list it here.
import board from './01-board.json';
import rook from './02-rook.json';
import bishop from './03-bishop.json';
import queen from './04-queen.json';
import king from './05-king.json';
import knight from './06-knight.json';
import pawn from './07-pawn.json';
import capture from './08-capture.json';
import check from './09-check.json';
import mate from './10-mate.json';
import special from './11-special.json';
import tactics from './12-tactics.json';
import opening from './13-opening.json';

export const RAW: unknown[] = [board, rook, bishop, queen, king, knight, pawn, capture, check, mate, special, tactics, opening];
