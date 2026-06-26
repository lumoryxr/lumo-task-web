declare module "solarlunar" {
  /** Result of a solar↔lunar conversion. `-1` (as the whole value) signals
   * invalid input on `lunar2solar`. */
  export interface SolarLunarResult {
    lYear: number;
    lMonth: number;
    lDay: number;
    isLeap: boolean;
    yearCn: string; // 二零二六年
    monthCn: string; // 五月 / 闰五月
    dayCn: string; // 初一 / 十二
    cYear: number;
    cMonth: number;
    cDay: number;
  }
  interface SolarLunar {
    solar2lunar(y: number, m: number, d: number): SolarLunarResult | -1;
    lunar2solar(y: number, m: number, d: number, isLeapMonth?: boolean): SolarLunarResult | -1;
    /** Leap month number for a lunar year, or 0 if none. */
    leapMonth(y: number): number;
    /** Days (29 or 30) in lunar month `m` of lunar year `y`. */
    monthDays(y: number, m: number): number;
  }
  const solarlunar: SolarLunar;
  export default solarlunar;
}
