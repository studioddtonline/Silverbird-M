class DummyTweet {
  static generate(input) {
    const utc = new Date().toUTCString();
    const now = Date.now();
    const id = DummyTweet.generateDummySnowflake(now);
    return Object.assign({
      "created_at": utc,
      "parsed_created_at": now,
      "id": id,
      "id_str": id,
      "is_dummy": true,
      "text": "",
      "source": "Silverbird M",
      "user":{
        "id":"1266336019",
        "id_str":"1266336019",
        "name":"Silverbird M",
        "screen_name":"Silverbird_M",
        "protected":false,
        "verified":false,
        "profile_image_url":"/img/icon128.png",
        "profile_image_url_https":"/img/icon128.png"
      },
      "entities":{
        "hashtags":[],
        "symbols":[],
        "urls":[],
        "user_mentions":[]
      }
    }, input);
  }
  static generateDummySnowflake(now = Date.now()) {
    const table = [
      [5764607523,  3423488], // 2 ** 59
      [2882303761, 51711744], // 2 ** 58
      [1441151880, 75855872], // 2 ** 57
      [ 720575940, 37927936], // 2 ** 56
      [ 360287970, 18963968], // 2 ** 55
      [ 180143985,  9481984], // 2 ** 54
      [  90071992, 54740992], // 2 ** 53
      [  45035996, 27370496], // 2 ** 52
      [  22517998, 13685248], // 2 ** 51
      [  11258999,  6842624], // 2 ** 50
      [   5629499, 53421312], // 2 ** 49
      [   2814749, 76710656], // 2 ** 48
      [   1407374, 88355328], // 2 ** 47
      [    703687, 44177664], // 2 ** 46
      [    351843, 72088832], // 2 ** 45
      [    175921, 86044416], // 2 ** 44
      [     87960, 93022208], // 2 ** 43
      [     43980, 46511104], // 2 ** 42
      [     21990, 23255552], // 2 ** 41
      [     10995, 11627776], // 2 ** 40
      [      5497, 55813888], // 2 ** 39
      [      2748, 77906944], // 2 ** 38
      [      1374, 38953472], // 2 ** 37
      [       687, 19476736], // 2 ** 36
      [       343, 59738368], // 2 ** 35
      [       171, 79869184], // 2 ** 34
      [        85, 89934592], // 2 ** 33
      [        42, 94967296], // 2 ** 32
      [        21, 47483648], // 2 ** 31
      [        10, 73741824], // 2 ** 30
      [         5, 36870912], // 2 ** 29
      [         2, 68435456], // 2 ** 28
      [         1, 34217728], // 2 ** 27
      [         0, 67108864], // 2 ** 26
      [         0, 33554432], // 2 ** 25
      [         0, 16777216], // 2 ** 24
      [         0,  8388608], // 2 ** 23
      [         0,  4194304]  // 2 ** 22
    ];
    const seq = now & 0xfffff; // dummy sequence code
    let high = 0;
    let low = seq;
    const base = [...(now - 1288834974657).toString(2)].map((e) => parseInt(e));
    base.reduce((prev, current, index, array) => {
      if(current) {
        high += table[index][0];
        low += table[index][1];
      }
      return 0;
    }, 0);
    high += (low / 100000000) | 0;
    return `${high}${`${low}`.substr(-8)}`;
  }
}
